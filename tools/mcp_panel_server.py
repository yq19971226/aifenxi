"""
跨 Cascade 面板通信 MCP Server

功能：
- send_message: 向指定面板发送消息
- get_messages: 获取指定面板的待读消息
- list_panels: 列出所有已注册面板

启动：
  python tools/mcp_panel_server.py

Windsurf 配置（mcp_config.json）：
  {"mcpServers": {"panel_bridge": {"serverUrl": "http://127.0.0.1:23986/mcp"}}}
"""

import time
import uuid
from collections import defaultdict
from threading import Lock

from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    "PanelBridge",
    stateless_http=True,
    json_response=True,
    port=23986,
)

# ── In-memory message store ──────────────────────────────────────────
_lock = Lock()
_messages: dict[str, list[dict]] = defaultdict(list)  # panel_id -> [msg]
_panels: dict[str, float] = {}  # panel_id -> last_seen_timestamp


@mcp.tool()
def send_message(
    destination_panel_id: str,
    message: str,
    source_panel_id: str = "anonymous",
    summary: str = "",
) -> dict:
    """向目标面板发送消息。

    Args:
        destination_panel_id: 目标面板 ID
        message: 要发送的消息内容
        source_panel_id: 来源面板 ID（可选）
        summary: 当前上下文摘要（可选）
    """
    msg = {
        "id": str(uuid.uuid4())[:8],
        "from": source_panel_id,
        "content": message,
        "summary": summary,
        "timestamp": time.time(),
    }
    with _lock:
        _messages[destination_panel_id].append(msg)
        _panels[source_panel_id] = time.time()
    return {"status": "sent", "msg_id": msg["id"], "to": destination_panel_id}


@mcp.tool()
def get_messages(
    panel_id: str,
    mark_read: bool = True,
) -> dict:
    """获取指定面板的待读消息。

    Args:
        panel_id: 要读取消息的面板 ID
        mark_read: 是否读取后清除消息队列（默认 True）
    """
    with _lock:
        _panels[panel_id] = time.time()
        msgs = list(_messages[panel_id])
        if mark_read:
            _messages[panel_id].clear()
    return {
        "panel_id": panel_id,
        "count": len(msgs),
        "messages": msgs,
    }


@mcp.tool()
def list_panels() -> dict:
    """列出所有已注册的面板及其最后活跃时间。"""
    with _lock:
        panels = {
            pid: {"last_seen": ts, "pending_messages": len(_messages[pid])}
            for pid, ts in _panels.items()
        }
    return {"panels": panels, "total": len(panels)}


@mcp.tool()
def broadcast(
    message: str,
    source_panel_id: str = "anonymous",
    exclude_self: bool = True,
) -> dict:
    """向所有已注册面板广播消息。

    Args:
        message: 要广播的消息内容
        source_panel_id: 来源面板 ID
        exclude_self: 是否排除自己（默认 True）
    """
    msg_template = {
        "from": source_panel_id,
        "content": message,
        "timestamp": time.time(),
    }
    sent_to = []
    with _lock:
        for pid in _panels:
            if exclude_self and pid == source_panel_id:
                continue
            msg = {**msg_template, "id": str(uuid.uuid4())[:8]}
            _messages[pid].append(msg)
            sent_to.append(pid)
    return {"status": "broadcast", "sent_to": sent_to, "count": len(sent_to)}


if __name__ == "__main__":
    print("PanelBridge MCP Server starting on http://127.0.0.1:23986/mcp")
    mcp.run(transport="streamable-http")
