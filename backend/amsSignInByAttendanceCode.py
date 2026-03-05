"""
AMS 签到脚本 - 独立版本
通过签到码和 X-Token 完成签到
"""
import httpx
try:
    from .amsLogin import get_xtoken_for_user 
except ImportError:
    from amsLogin import get_xtoken_for_user

# ============================================================================
# 配置区域
# ============================================================================

# API 配置
SIGN_IN_URL = "https://ams.xjtlu.edu.cn/xjtlu/sign/qRCodeSign"

# 请求配置
REQUEST_TIMEOUT = 15

# ============================================================================
# 日志配置
# ============================================================================

try:
    from .logConfig import get_logger
except ImportError:
    from logConfig import get_logger

logger = get_logger("CODESIGN")

# ============================================================================
# 响应码定义
# ============================================================================

class ResponseCode:
    """API 响应码"""
    SUCCESS = 0
    ALREADY_SIGNED = 1001
    TOKEN_EXPIRED = 401

# ============================================================================
# 签到逻辑
# ============================================================================

def sign_in(x_token: str, code: str, username: str) -> tuple[bool, str, dict | None]:
    """
    执行签到
    """
    headers = {
        "X-Token": x_token,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    }
    
    params = {
        "code": code,
        "type": "2",
    }
    
    try:
        logger.info(f"[{username}] 正在签到，签到码: {code}")
        
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.get(SIGN_IN_URL, headers=headers, params=params)
            response.raise_for_status()
            
        data = response.json()
        resp_code = data.get("code")
        message = data.get("message", "")
        resp_data = data.get("data")
        
        # 成功情况1: code=0
        if resp_code == ResponseCode.SUCCESS:
            logger.success(f"[{username}] 签到成功: {message}")
            return True, message, resp_data
        
        # 成功情况2: code=1001 且 已签到
        if resp_code == ResponseCode.ALREADY_SIGNED and "already checked in" in message.lower():
            logger.success(f"[{username}] 已签到: {message}")
            return True, message, resp_data
        
        # X-Token 过期
        if resp_code == ResponseCode.TOKEN_EXPIRED:
            logger.warning(f"[{username}] X-Token 已过期: {message}")
            return False, message, None
        
        # 其它情况: 签到失败
        logger.error(f"[{username}] 签到失败 [code={resp_code}]: {message}")
        return False, message, None
        
    except httpx.HTTPStatusError as e:
        msg = f"HTTP 请求失败: {e}"
        logger.error(msg)
        return False, msg, None
    except httpx.RequestError as e:
        msg = f"网络请求错误: {e}"
        logger.error(msg)
        return False, msg, None
    except ValueError as e:
        msg = f"响应解析失败: {e}"
        logger.error(msg)
        return False, msg, None

# ============================================================================
# 便捷函数
# ============================================================================

def sign_in_with_auto_token_for_user(code: str, user_config: dict) -> tuple[bool, str, dict | None]:
    """
    自动获取 X-Token 并执行签到
    """
    username = user_config.get("username")
    logger.info(f"[{username}] 正在获取 X-Token...")
    x_token = get_xtoken_for_user(user_config)
    
    if not x_token:
        msg = f"[{username}] 获取 X-Token 失败，请检查登录状态"
        logger.error(msg)
        return False, msg, None
    
    return sign_in(x_token, code, username)

