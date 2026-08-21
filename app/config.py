"""运行配置。

优先读取当前目录下的 .env（python-dotenv，存在才加载），
再读取进程已有的环境变量，最后使用与源项目一致的默认值。
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]

try:
    from dotenv import load_dotenv

    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:  # 未安装 python-dotenv 时退化为纯环境变量
    pass


@dataclass(frozen=True)
class AppConfig:
    zhipu_api_key: str | None
    embedding_model: str
    embedding_dimensions: int
    rerank_model: str
    chat_model: str
    milvus_address: str
    milvus_collection: str
    milvus_token: str | None
    storage_root: Path
    port: int


def load_config() -> AppConfig:
    """从 .env 与进程环境变量中读取配置，并提供和源项目一致的默认值。"""

    storage_root = os.getenv("STORAGE_ROOT")
    token = (os.getenv("MILVUS_TOKEN") or "").strip()
    api_key = (os.getenv("ZHIPU_API_KEY") or "").strip()

    return AppConfig(
        zhipu_api_key=api_key or None,
        embedding_model=os.getenv("EMBEDDING_MODEL", "embedding-3"),
        embedding_dimensions=int(os.getenv("EMBEDDING_DIMENSIONS", "512")),
        rerank_model=os.getenv("RERANK_MODEL", "rerank"),
        chat_model=os.getenv("CHAT_MODEL", "glm-4.5-air"),
        milvus_address=os.getenv("MILVUS_ADDRESS", "127.0.0.1:19530"),
        milvus_collection=os.getenv(
            "MILVUS_COLLECTION", "enterprise_knowledge_chunks"
        ),
        milvus_token=token or None,
        storage_root=Path(storage_root).expanduser()
        if storage_root
        else PROJECT_ROOT / "storage" / "documents",
        port=int(os.getenv("PORT", "3000")),
    )
