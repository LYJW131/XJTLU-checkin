"""
Bark 通知模块
发送推送通知到 iOS 设备的 Bark 应用
"""
import requests
import backoff
import os
from typing import Optional

# ============================================================================
# 配置区域
# ============================================================================

# 从环境变量获取配置
BARK_SERVER_URL = os.getenv("BARK_SERVER_URL", "https://api.day.app")
BARK_DEVICE_KEY = os.getenv("BARK_DEVICE_KEY")

# 默认配置
DEFAULT_ICON = "https://lyjw131.com/images/XJTLU_Logo.png"
DEFAULT_GROUP = "xjtlu"

# 请求超时（秒）
REQUEST_TIMEOUT = 10

# ============================================================================
# 日志配置
# ============================================================================

try:
    from .logConfig import get_logger
except ImportError:
    from logConfig import get_logger

logger = get_logger("BARK")

# ============================================================================
# 工具函数
# ============================================================================

def is_valid_config() -> bool:
    """检查配置是否有效"""
    if not BARK_DEVICE_KEY:
        logger.error("缺少环境变量: BARK_DEVICE_KEY")
        return False
    return True


def build_payload(
    title: str,
    body: str,
    *,
    copy: Optional[str] = None,
    badge: Optional[int] = None,
    icon: Optional[str] = None,
    group: Optional[str] = None,
    url: Optional[str] = None,
    sound: Optional[str] = None,
    level: Optional[str] = None,
    is_archive: Optional[int] = None,
) -> dict:
    """
    构建推送请求的 payload
    
    Args:
        title: 推送标题（必须）
        body: 推送内容（必须）
        copy: 点击复制的内容
        badge: 角标数字
        icon: 推送图标 URL
        group: 推送分组
        url: 点击跳转的 URL
        sound: 推送铃声
        level: 推送级别 (active, timeSensitive, passive)
        is_archive: 是否保存到历史记录 (1 保存)
    
    Returns:
        构建好的 payload 字典
    """
    payload = {
        "device_key": BARK_DEVICE_KEY,
        "title": title,
        "body": body,
    }
    
    # 添加可选参数
    optional_params = {
        "copy": copy,
        "badge": badge,
        "icon": icon or DEFAULT_ICON,
        "group": group or DEFAULT_GROUP,
        "url": url,
        "sound": sound,
        "level": level,
        "isArchive": is_archive,
    }
    
    for key, value in optional_params.items():
        if value is not None:
            payload[key] = value
    
    return payload


# ============================================================================
# 通知函数
# ============================================================================

@backoff.on_exception(
    backoff.expo,
    requests.exceptions.RequestException,
    max_tries=3,
    base=2,
    # on_backoff=lambda d: logger.warning(f"请求失败，重试等待 {d['wait']:.1f}s"),
    # on_giveup=lambda d: logger.error("重试次数耗尽"),
)
def send_notification(
    title: str,
    body: str,
    *,
    copy: Optional[str] = None,
    badge: Optional[int] = None,
    icon: Optional[str] = None,
    group: Optional[str] = None,
    url: Optional[str] = None,
    sound: Optional[str] = None,
    level: Optional[str] = None,
    is_archive: Optional[int] = None,
) -> bool:
    """
    发送 Bark 推送通知
    
    Args:
        title: 推送标题（必须）
        body: 推送内容（必须）
        copy: 点击复制的内容
        badge: 角标数字
        icon: 推送图标 URL
        group: 推送分组
        url: 点击跳转的 URL
        sound: 推送铃声
        level: 推送级别 (active, timeSensitive, passive)
        is_archive: 是否保存到历史记录 (1 保存)
    
    Returns:
        是否发送成功
    """
    if not is_valid_config():
        return False
    
    payload = build_payload(
        title=title,
        body=body,
        copy=copy,
        badge=badge,
        icon=icon,
        group=group,
        url=url,
        sound=sound,
        level=level,
        is_archive=is_archive,
    )
    
    push_url = f"{BARK_SERVER_URL.rstrip('/')}/push"
    
    try:
        response = requests.post(
            url=push_url,
            headers={"Content-Type": "application/json; charset=utf-8"},
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("code") == 200:
                logger.info(f"推送成功: {title}")
                return True
            else:
                logger.error(f"推送失败: {result.get('message', '未知错误')}")
                return False
        else:
            logger.error(f"HTTP 错误: {response.status_code}")
            return False
            
    except requests.exceptions.Timeout:
        logger.error("请求超时")
        raise
    except requests.exceptions.ConnectionError:
        logger.error(f"连接失败: {push_url}")
        raise
    except requests.exceptions.RequestException as e:
        logger.error(f"请求异常: {e}")
        raise


def notify(title: str, body: str, **kwargs) -> bool:
    """
    发送通知的简便方法
    
    Args:
        title: 推送标题（必须）
        body: 推送内容（必须）
        **kwargs: 其他可选参数
    
    Returns:
        是否发送成功
    """
    return send_notification(title, body, **kwargs)

if __name__ == "__main__":
    if not is_valid_config():
        logger.error("配置无效，请设置环境变量 BARK_DEVICE_KEY")
        exit(1)
    
    success = notify(
        title="测试通知",
        body="这是一条测试消息",
    )
    
    if success:
        logger.info("测试推送完成")
    else:
        logger.error("测试推送失败")
