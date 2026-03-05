"""
AMS X-Token 获取脚本（纯 HTTP 请求版本）
通过模拟 OAuth2 重定向流程获取 Token，无需无头浏览器
"""
import json
import re
import time
import asyncio
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urljoin
import requests

# ============================================================================
# 配置区域
# ============================================================================

# URL 配置
AMS_URL = "https://ams.xjtlu.edu.cn/"
AMS_SSO_AUTO_REDIRECT = "https://ams.xjtlu.edu.cn/xjtlu/sso/iam/autoRedirect"
AMS_LOGIN_PC = "https://ams.xjtlu.edu.cn/xjtlu/sso/mobile/iam/loginPC"
AMS_MOBILE_LOGIN = "https://ams.xjtlu.edu.cn/xjtlu/sso/mobile/login"

# Cookie 和 缓存文件基本路径
CACHE_DIR = Path(__file__).parent.parent / "data" / "cache"

# 缓存过期时间（秒）
AMS_CACHE_EXPIRE_SECONDS = 3600

# 请求头配置
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'

COMMON_HEADERS = {
    'User-Agent': USER_AGENT,
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

logger = get_logger("GETXTOK")

# ============================================================================
# 工具函数
# ============================================================================

def get_cookie_file(username: str) -> Path:
    return CACHE_DIR / f"uim_cookies_{username}.json"

def get_cache_file(username: str) -> Path:
    return CACHE_DIR / f"ams_cache_{username}.json"

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


def load_ams_cache(username: str) -> str | None:
    """
    加载 AMS 缓存，如果缓存有效则返回 X-Token，否则返回 None
    缓存格式: {"x_token": str, "expire_at": float}
    """
    cache_file = get_cache_file(username)
    try:
        if not cache_file.exists():
            logger.debug(f"[{username}] AMS 缓存文件不存在")
            return None
        
        with open(cache_file, 'r', encoding='utf-8') as f:
            cache = json.load(f)
        
        # 检查必要字段
        if not all(k in cache for k in ['x_token', 'expire_at']):
            logger.warning(f"[{username}] AMS 缓存格式无效")
            return None
        
        # 检查是否过期
        if time.time() > cache['expire_at']:
            logger.info(f"[{username}] AMS 缓存已过期")
            return None
        
        remaining = int(cache['expire_at'] - time.time())
        logger.info(f"[{username}] AMS 缓存有效，剩余 {remaining} 秒")
        return cache['x_token']
        
    except Exception as e:
        logger.error(f"[{username}] 加载AMS缓存失败: {e}")
        return None


def save_ams_cache(username: str, x_token: str) -> bool:
    """
    保存 X-Token 到缓存文件
    """
    cache_file = get_cache_file(username)
    try:
        cache = {
            "x_token": x_token,
            "expire_at": time.time() + AMS_CACHE_EXPIRE_SECONDS,
            "created_at": time.time()
        }
        
        # 确保目录存在
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
        
        logger.success(f"[{username}] AMS 缓存已保存，有效期 {AMS_CACHE_EXPIRE_SECONDS} 秒")
        return True
        
    except Exception as e:
        logger.error(f"[{username}] 保存AMS缓存失败: {e}")
        return False


def get_redirect_location(response: requests.Response) -> str:
    """从响应中获取重定向 URL"""
    # 优先从 Location header 获取
    if 'Location' in response.headers:
        return response.headers['Location']
    
    # 尝试从 HTML 中解析 meta refresh 或 JS 重定向
    if response.text:
        # 匹配 window.location 或 location.href
        match = re.search(r'(?:window\.)?location(?:\.href)?\s*=\s*["\']([^"\']+)["\']', response.text)
        if match:
            return match.group(1)
        # 匹配 meta refresh
        match = re.search(r'<meta[^>]*http-equiv=["\']refresh["\'][^>]*content=["\'][^"\']*url=([^"\']+)["\']', response.text, re.I)
        if match:
            return match.group(1)
    return None


class AmsHttpClient:
    """AMS HTTP 客户端 - 处理 OAuth2 重定向流程"""
    
    def __init__(self, username: str):
        self.username = username
        self.session = requests.Session()
        self.session.headers.update(COMMON_HEADERS)
        self.uim_cookies = load_uim_cookies(username)
    
    def _request_with_conditional_cookies(self, method: str, url: str, **kwargs) -> requests.Response:
        """
        发送请求，根据域名决定是否添加 UIM cookies
        """
        parsed = urlparse(url)
        
        if 'uim.xjtlu.edu.cn' in parsed.netloc:
            cookies = kwargs.get('cookies', {})
            cookies.update(self.uim_cookies)
            kwargs['cookies'] = cookies
            logger.debug(f"[{self.username}] 为 UIM 请求添加 cookies: {url[:80]}...")
        
        # 禁止自动重定向，手动处理
        kwargs['allow_redirects'] = False
        
        response = self.session.request(method, url, **kwargs)
        logger.debug(f"[{self.username}] [{response.status_code}] {method} {url[:80]}...")
        
        return response
    
    def follow_redirects(self, url: str, max_redirects: int = 20) -> requests.Response:
        """
        手动跟随重定向，为 UIM 请求添加 cookies
        """
        current_url = url
        
        for i in range(max_redirects):
            response = self._request_with_conditional_cookies('GET', current_url)
            
            # 检查是否是重定向
            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get('Location')
                if location:
                    # 处理相对 URL
                    if not location.startswith('http'):
                        location = urljoin(current_url, location)
                    logger.debug(f"[{self.username}] 重定向 -> {location[:80]}...")
                    current_url = location
                    continue
            
            # 检查 HTML 中的 JS 重定向
            redirect_url = get_redirect_location(response)
            if redirect_url and redirect_url != current_url:
                if not redirect_url.startswith('http'):
                    redirect_url = urljoin(current_url, redirect_url)
                logger.debug(f"[{self.username}] JS重定向 -> {redirect_url[:80]}...")
                current_url = redirect_url
                continue
            
            # 没有更多重定向
            return response
        
        logger.warning(f"[{self.username}] 达到最大重定向次数 {max_redirects}")
        return response
    
    def get_xtoken(self) -> str:
        """
        获取 X-Token
        """
        logger.info(f"[{self.username}] 开始获取 X-Token...")
        
        try:
            # Step 1: 调用 loginPC 获取 SSO 授权 URL
            logger.info(f"[{self.username}] 获取 SSO 授权 URL...")
            response = self.session.get(AMS_LOGIN_PC, headers=COMMON_HEADERS)
            
            if response.status_code != 200:
                logger.error(f"[{self.username}] loginPC 返回错误: {response.status_code}")
                return None
            
            try:
                data = response.json()
                sso_url = data.get('data')
                if not sso_url:
                    logger.error(f"[{self.username}] loginPC 响应无效: {data}")
                    return None
                logger.debug(f"[{self.username}] SSO URL: {sso_url}")
            except json.JSONDecodeError:
                logger.error(f"[{self.username}] loginPC 响应不是 JSON: {response.text[:200]}")
                return None
            
            # Step 2: 跟随 SSO 重定向（会经过 UIM 认证）
            logger.info(f"[{self.username}] 跟随 SSO 重定向流程...")
            response = self.follow_redirects(sso_url)
            
            # 从最终 URL 提取 code
            code = None
            final_url = response.url if hasattr(response, 'url') else None
            
            if final_url:
                parsed = urlparse(final_url)
                params = parse_qs(parsed.query)
                if 'code' in params:
                    code = params['code'][0]
            
            # 如果没有，检查响应内容中的 URL
            if not code and response.text:
                # 匹配 callback URL 中的 code
                match = re.search(r'[?&]code=([a-f0-9]+)', response.text)
                if match:
                    code = match.group(1)
                # 也可能在 JSON 响应中
                try:
                    resp_data = response.json()
                    if 'code' in str(resp_data):
                        match = re.search(r'code=([a-f0-9]+)', str(resp_data))
                        if match:
                            code = match.group(1)
                except:
                    pass
            
            if not code:
                logger.warning(f"[{self.username}] 未获取到 code，尝试解析响应...")
                logger.debug(f"[{self.username}] 最终 URL: {final_url}")
                logger.debug(f"[{self.username}] 响应内容: {response.text[:500] if response.text else 'empty'}")
                return None
            
            # Step 4: 使用 code 调用登录 API
            logger.info(f"[{self.username}] 调用登录 API...")
            login_url = f"{AMS_MOBILE_LOGIN}?code={code}"
            
            login_response = self.session.get(login_url, headers=COMMON_HEADERS)
            
            if login_response.status_code != 200:
                logger.error(f"[{self.username}] 登录 API 返回错误: {login_response.status_code}")
                return None
            
            # 解析 JSON 响应获取 Token
            try:
                data = login_response.json()
                logger.debug(f"[{self.username}] 登录响应: {json.dumps(data, ensure_ascii=False)[:300]}")
                
                # Token 可能在不同字段中
                token = None
                if isinstance(data.get('data'), dict):
                    token = data['data'].get('token') or data['data'].get('Token')
                if not token:
                    token = data.get('token') or data.get('Token')
                
                if token:
                    logger.success(f"[{self.username}] Token获取成功: {token}")
                    return token
                else:
                    logger.warning(f"[{self.username}] 响应中未找到 Token: {data}")
                    return None
                    
            except json.JSONDecodeError:
                logger.error(f"[{self.username}] 响应不是有效的 JSON: {login_response.text[:200]}")
                return None
                
        except Exception as e:
            logger.error(f"[{self.username}] 获取 Token 出错: {e}")
            import traceback
            traceback.print_exc()
            return None


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
# 主函数
# ============================================================================

def get_xtoken_for_user(user_config: dict, allow_refresh: bool = True) -> str:
    """
    获取 X-Token 的便捷函数（优先使用缓存）
    """
    username = user_config.get("username")
    
    # 优先从缓存加载
    cached_token = load_ams_cache(username)
    if cached_token:
        logger.info(f"[{username}] 使用缓存的 X-Token")
        return cached_token
    
    # 缓存无效，走完整流程
    cookie_file = get_cookie_file(username)
    if not cookie_file.exists():
        logger.error(f"[{username}] cookies文件不存在: {cookie_file}")
        if allow_refresh:
            logger.info(f"[{username}] 尝试通过重新登录创建 cookies...")
            if refresh_uim_cookies(user_config):
                return get_xtoken_for_user(user_config, allow_refresh=False)
        return None
    
    client = AmsHttpClient(username)
    
    if not client.uim_cookies:
        logger.error(f"[{username}] 无本地cookies")
        if allow_refresh:
            logger.info(f"[{username}] 尝试通过重新登录获取 cookies...")
            if refresh_uim_cookies(user_config):
                return get_xtoken_for_user(user_config, allow_refresh=False)
        return None
    
    token = client.get_xtoken()
    
    # 成功获取后保存缓存
    if token:
        save_ams_cache(username, token)
        return token
    
    # 获取失败，可能是 cookies 过期
    if allow_refresh:
        logger.warning(f"[{username}] 获取 Token 失败，可能是 UIM cookies 过期")
        if refresh_uim_cookies(user_config):
            return get_xtoken_for_user(user_config, allow_refresh=False)
    
    return None

