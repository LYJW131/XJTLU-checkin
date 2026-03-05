"""
AMS 二维码签到脚本 - 独立版本
通过扫描二维码链接，自动完成 OAuth2 认证流程并签到
"""
import json
import asyncio
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urljoin
import requests

# ============================================================================
# 配置区域
# ============================================================================

# URL 配置
AMS_SILENT_AUTH_URL = "https://ams.xjtlu.edu.cn/xjtlu/wechat/silentAuth"
AMS_WECHAT_LOGIN_URL = "https://ams.xjtlu.edu.cn/xjtlu/wechat/login"

# Cookie 文件基本路径 (由于现在多用户，将添加 username 后缀)
COOKIE_DIR = Path(__file__).parent.parent / "data" / "cache"

# 请求配置
REQUEST_TIMEOUT = 15
MAX_REDIRECTS = 20

# 手机端 User-Agent（必须模拟手机端）
MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/AP31.240617.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36'

COMMON_HEADERS = {
    'User-Agent': MOBILE_USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
}

# ============================================================================
# 日志配置
# ============================================================================

try:
    from .logConfig import get_logger
    from . import uimLogin
except ImportError:
    from logConfig import get_logger
    import uimLogin

logger = get_logger("QRSIGN")

# ============================================================================
# 工具函数
# ============================================================================

def get_cookie_file(username: str) -> Path:
    return COOKIE_DIR / f"uim_cookies_{username}.json"

def load_uim_cookies(username: str) -> dict:
    """从文件加载 UIM cookies 并转换为 requests 可用的 dict 格式"""
    cookie_file = get_cookie_file(username)
    try:
        if cookie_file.exists():
            with open(cookie_file, 'r', encoding='utf-8') as f:
                cookies_list = json.load(f)
            # 转换为 {name: value} 格式
            return {c['name']: c['value'] for c in cookies_list}
    except Exception as e:
        logger.error(f"[{username}] 加载cookies失败: {e}")
    return {}


def extract_param_from_url(url: str, param_name: str) -> str:
    """从 URL 中提取指定参数（支持 hash 路由）"""
    try:
        # 处理 hash 路由 URL: https://xxx/#/?param=xxx
        if '#' in url:
            hash_part = url.split('#')[1]
            if '?' in hash_part:
                query_str = hash_part.split('?')[1]
                for param in query_str.split('&'):
                    if param.startswith(f'{param_name}='):
                        return param[len(param_name) + 1:]
        
        # 尝试常规解析
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        if param_name in params:
            return params[param_name][0]
            
    except Exception as e:
        logger.error(f"解析URL失败: {e}")
    return None


def extract_state_from_url(url: str) -> str:
    """从二维码 URL 中提取 state 参数"""
    return extract_param_from_url(url, 'state')


def extract_code_from_url(url: str) -> str:
    """从回调 URL 中提取 code 参数"""
    return extract_param_from_url(url, 'code')


# ============================================================================
# 签到客户端
# ============================================================================

class QRCodeSignClient:
    """二维码签到客户端 - 处理 OAuth2 重定向流程"""
    
    def __init__(self, username: str):
        self.username = username
        self.session = requests.Session()
        self.session.headers.update(COMMON_HEADERS)
        self.uim_cookies = load_uim_cookies(username)
    
    def _request_with_conditional_cookies(self, method: str, url: str, **kwargs) -> requests.Response:
        """
        发送请求，根据域名决定是否添加 UIM cookies
        对 uim.xjtlu.edu.cn 的请求添加本地 cookies
        """
        parsed = urlparse(url)
        
        # 如果是 uim.xjtlu.edu.cn 域名，添加 UIM cookies
        if 'uim.xjtlu.edu.cn' in parsed.netloc:
            cookies = kwargs.get('cookies', {})
            cookies.update(self.uim_cookies)
            kwargs['cookies'] = cookies
            logger.debug(f"[{self.username}] 为 UIM 请求添加 cookies: {url[:80]}...")
        
        # 禁止自动重定向，手动处理
        kwargs['allow_redirects'] = False
        kwargs['timeout'] = REQUEST_TIMEOUT
        
        response = self.session.request(method, url, **kwargs)
        logger.debug(f"[{self.username}] [{response.status_code}] {method} {url}")
        if response.status_code in (301, 302, 303, 307, 308):
            logger.debug(f"[{self.username}]   -> Location: {response.headers.get('Location', 'N/A')}")
        
        return response
    
    def follow_redirects(self, url: str, max_redirects: int = MAX_REDIRECTS) -> requests.Response:
        """手动跟随重定向，为 UIM 请求添加 cookies"""
        current_url = url
        
        for _ in range(max_redirects):
            response = self._request_with_conditional_cookies('GET', current_url)
            
            # 检查是否是重定向
            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get('Location')
                if location:
                    if not location.startswith('http'):
                        location = urljoin(current_url, location)
                    logger.debug(f"[{self.username}] 重定向 -> {location[:80]}...")
                    current_url = location
                    continue
            
            # 没有更多重定向
            response.final_url = current_url
            return response
        
        response.final_url = current_url
        return response
    
    def sign_in_by_qrcode(self, qrcode_url: str) -> tuple[bool, str, dict | None]:
        """
        通过二维码URL完成签到
        """
        logger.info(f"[{self.username}] 开始二维码签到...")
        
        # Step 1: 提取 state 参数
        state = extract_state_from_url(qrcode_url)
        if not state:
            msg = f"[{self.username}] 无法从URL中提取state参数"
            logger.error(msg)
            return False, msg, None
        logger.info(f"[{self.username}] State: {state}")
        
        try:
            # Step 2: 调用 silentAuth API 获取 SSO URL
            logger.info(f"[{self.username}] 调用静默认证 API")
            silent_auth_url = f"{AMS_SILENT_AUTH_URL}?state={state}&userId=&token="
            
            response = self._request_with_conditional_cookies('GET', silent_auth_url)
            
            if response.status_code != 200:
                msg = f"[{self.username}] silentAuth API 返回错误: {response.status_code}"
                logger.error(msg)
                return False, msg, None
            
            # 解析 JSON 响应获取 SSO URL
            try:
                data = response.json()
                if data.get('code') != 0:
                    msg = f"[{self.username}] silentAuth 失败: {data.get('message')}"
                    logger.error(msg)
                    return False, msg, None
                
                sso_url = data.get('data')
                if not sso_url:
                    msg = f"[{self.username}] silentAuth 响应中无 SSO URL"
                    logger.error(msg)
                    return False, msg, None
                    
                logger.debug(f"[{self.username}] SSO URL: {sso_url}")
                
            except json.JSONDecodeError:
                msg = f"[{self.username}] silentAuth 响应解析失败: {response.text[:200]}"
                logger.error(msg)
                return False, msg, None
            
            # Step 3: 跟随 SSO 重定向流程（经过 UIM 认证）
            logger.info(f"[{self.username}] 跟随 SSO 重定向流程")
            response = self.follow_redirects(sso_url)
            final_url = getattr(response, 'final_url', None)
            
            # Step 4: 从最终 URL 提取 code（hash 路由格式）
            code = extract_code_from_url(final_url)
            if not code:
                msg = f"[{self.username}] 未能获取授权 code，最终URL: {final_url}"
                logger.error(msg)
                return False, msg, None
            
            logger.debug(f"[{self.username}] code: {code[:20]}...")
            
            # Step 4: 调用 login API 完成签到
            logger.info(f"[{self.username}] 调用登录 API 完成签到")
            login_url = f"{AMS_WECHAT_LOGIN_URL}?code={code}"
            
            login_response = self.session.get(
                login_url, 
                headers=COMMON_HEADERS,
                timeout=REQUEST_TIMEOUT
            )
            
            if login_response.status_code != 200:
                msg = f"[{self.username}] 登录 API 返回错误: {login_response.status_code}"
                logger.error(msg)
                return False, msg, None
            
            # 解析响应
            try:
                data = login_response.json()
                logger.debug(f"[{self.username}] 登录响应: {json.dumps(data, ensure_ascii=False)[:500]}")
                
                resp_code = data.get('code')
                
                # 顶层失败
                if resp_code != 0:
                    message = data.get('message', '') or data.get('msg', '')
                    logger.error(f"[{self.username}] API 调用失败 [code={resp_code}]: {message}")
                    return False, message, None
                
                # 解析响应数据
                resp_data = data.get('data', {})
                
                # 提取签到结果 (checkInfo)
                check_info = resp_data.get('checkInfo', {}) if isinstance(resp_data, dict) else {}
                check_code = check_info.get('code')
                check_message = check_info.get('message', '')
                check_data = check_info.get('data') if isinstance(check_info, dict) else None
                
                # 提取登录信息
                login_info = resp_data.get('loginInfo', {}) if isinstance(resp_data, dict) else {}
                user_name = ''
                if isinstance(login_info, dict) and login_info.get('data'):
                    user_data = login_info['data']
                    user_name = user_data.get('fullnameCn') or user_data.get('fullnameEn') or user_data.get('name', '')
                
                if user_name:
                    logger.info(f"[{self.username}] 用户识别: {user_name}")
                
                # 判断签到结果
                if check_code == 0:
                    logger.success(f"[{self.username}] 签到成功! {check_message}")
                    return True, check_message, check_data
                
                # 已签到
                if check_code == 1001 and "already" in check_message.lower():
                    logger.success(f"[{self.username}] 已签到: {check_message}")
                    return True, check_message, check_data
                
                # 二维码过期或无效
                if check_code == 1001:
                    if "expired" in check_message.lower() or "invalid" in check_message.lower():
                        logger.warning(f"[{self.username}] 二维码已过期或无效: {check_message}")
                    else:
                        logger.warning(f"[{self.username}] 签到失败: {check_message}")
                    return False, check_message, None
                
                # 其他失败情况
                logger.error(f"[{self.username}] 签到失败 [code={check_code}]: {check_message}")
                return False, check_message, None
                
            except json.JSONDecodeError:
                msg = f"[{self.username}] 响应解析失败: {login_response.text[:200]}"
                logger.error(msg)
                return False, msg, None
                
        except requests.RequestException as e:
            msg = f"[{self.username}] 网络请求错误: {e}"
            logger.error(msg)
            return False, msg, None
        except Exception as e:
            msg = f"[{self.username}] 签到出错: {e}"
            logger.error(msg)
            import traceback
            traceback.print_exc()
            return False, msg, None


# ============================================================================
# UIM 重登录工具
# ============================================================================

def refresh_uim_cookies(user_config: dict) -> bool:
    """
    调用 uimLogin 重新登录并刷新 cookies
    """
    username = user_config.get("username")
    logger.info(f"[{username}] 尝试刷新 UIM cookies...")
    try:
        from uimLogin import uim_login_for_user
        success = uim_login_for_user(user_config)
        if success:
            logger.success(f"[{username}] UIM 重新登录成功")
        else:
            logger.error(f"[{username}] UIM 重新登录失败")
        return success
    except Exception as e:
        logger.error(f"[{username}] UIM 重新登录出错: {e}")
        return False


# ============================================================================
# 便捷函数
# ============================================================================

def sign_in_for_user(qrcode_url: str, user_config: dict, allow_refresh: bool = True) -> tuple[bool, str, dict | None]:
    """
    指定的用户的二维码签到便捷函数
    """
    username = user_config.get("username")
    cookie_file = get_cookie_file(username)
    
    if not cookie_file.exists():
        if allow_refresh:
            logger.warning(f"[{username}] cookies文件不存在，尝试重新登录...")
            if refresh_uim_cookies(user_config):
                return sign_in_for_user(qrcode_url, user_config, allow_refresh=False)
        msg = f"[{username}] cookies文件不存在，自动登录失败"
        logger.error(msg)
        return False, msg, None
    
    client = QRCodeSignClient(username)
    
    if not client.uim_cookies:
        if allow_refresh:
            logger.warning(f"[{username}] 本地cookies为空，尝试重新登录...")
            if refresh_uim_cookies(user_config):
                return sign_in_for_user(qrcode_url, user_config, allow_refresh=False)
        msg = f"[{username}] 无本地cookies，自动登录失败"
        logger.error(msg)
        return False, msg, None
    
    success, message, data = client.sign_in_by_qrcode(qrcode_url)
    
    # 检查是否是 cookies 过期导致的失败（未获取到 code）
    if not success and allow_refresh and "未能获取授权 code" in message:
        logger.warning(f"[{username}] 可能是 UIM cookies 过期，尝试重新登录...")
        if refresh_uim_cookies(user_config):
            return sign_in_for_user(qrcode_url, user_config, allow_refresh=False)
    
    return success, message, data

