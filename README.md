# 企业知识库（enterprise-knowledge）

企业级知识库搭建demo：FastAPI 后端 + 原生静态前端 + Milvus 混合检索 + 文档版本更新 + 权限隔离 +
Rerank 精排 + 来源引用 + 拒答。

## 功能拆解对照清单

| # | 功能模块 | 文件 | 核心职责 |
|---|---------|------|---------|
| 1 | 配置加载 | `app/config.py` | 读取环境变量 / `.env`，提供默认值 |
| 2 | 业务异常 | `app/exceptions.py` | 400/401/403/404/503 统一异常 |
| 3 | 数据结构 | `app/models.py` | DemoUser、Chunk、文档、答案等模型 |
| 4 | 演示身份 | `app/auth.py` | 4 个跨租户演示用户，Bearer Token 鉴权 |
| 5 | 权限 Filter | `app/filtering.py` | 租户/部门/可见性/生效状态过滤表达式 |
| 6 | Markdown 分块 | `app/markdown_chunker.py` | 按标题层级分块，700 字符 / 80 重叠 |
| 7 | 存储层 | `app/milvus_store.py` | Collection、混合检索、版本切换、软删除 |
| 8 | AI 服务 | `app/ai_service.py` | 智谱 Embedding / Rerank / Chat，重试与校验 |
| 9 | 文档服务 | `app/document_service.py` | 入库、checksum 去重、版本切换、软删除 |
| 10 | 问答服务 | `app/knowledge_service.py` | 检索 → 精排 → 生成 → 来源绑定 |
| 11 | API 入口 | `app/main.py` | 8 个接口 + 异常处理 + 静态托管 |
| 12 | 前端 | `app/static/` | 身份切换、文档管理、Markdown 抽屉编辑器、知识问答 |
| 13 | 环境检查 | `scripts/doctor.py` | Python / Key / 维度 / Milvus 四项检查 |
| 14 | 样例导入 | `scripts/seed.py` | 幂等导入 5 份跨租户样例文档 |
| 15 | 样例文档 | `sample_documents/` | 蓝鲸科技 / 星河零售 跨部门样例 |
| 16 | 离线测试 | `tests/` | unittest，不依赖 Milvus 与真实 API |
| 17 | 编排 | `docker-compose.yml` | etcd + MinIO + Milvus 2.6.18 |

## 技术栈与外部依赖

- **后端**：Python 3.11+ / FastAPI / Uvicorn / Pydantic
- **向量数据库**：Milvus 2.6.18（Docker Compose 本地部署，etcd + MinIO 配套），PyMilvus 2.6.12；也兼容 **Zilliz Cloud 托管版**（代码零改动，见下文）
- **AI 能力**：智谱开放平台（`embedding-3` 向量、`rerank` 精排、`glm-4.5-air` 对话），HTTP 直连
- **前端**：原生 HTML/CSS/JS，无构建工具
- **依赖管理**：uv；**测试**：标准库 unittest

## 运行环境版本（已验证）

| 组件 | 版本 | 说明 |
|------|------|------|
| Python | 3.12.x（推荐，uv 自动锁定） | 要求 ≥3.11；本项目在 3.12.13 验证 |
| uv | 0.12+ | 依赖管理 + 解释器管理 |
| FastAPI | 0.141.x | 见 `pyproject.toml` |
| PyMilvus | 2.6.12 | 固定版本（对应 Milvus 2.6.x） |
| Milvus | 2.6.18（本地 Docker） | 或 Zilliz Cloud Serverless |
| Docker Desktop | 任意近期版本 | 仅本地数据库方案需要 |
| 服务器 | Ubuntu 22.04 LTS | 部署验证环境（nginx 1.18 + systemd） |

## 所需依赖

```toml
fastapi>=0.116.0,<1.0.0
pymilvus==2.6.12
python-multipart>=0.0.20,<1.0.0
uvicorn[standard]>=0.35.0,<1.0.0
python-dotenv>=1.0.0
```

安装：`uv sync`（自动生成 `.venv` 与 `uv.lock`，国内网络可加 `UV_DEFAULT_INDEX=https://pypi.tuna.tsinghua.edu.cn/simple`）。

## 环境准备

1. 安装 **uv**（若未安装：`pip install uv` 或官网安装脚本 <https://astral.sh/uv/>）。
2. 复制 `.env.example` 为 `.env` 并填写：
   - `ZHIPU_API_KEY`（必填，智谱开放平台申请：<https://open.bigmodel.cn/>，需覆盖 `embedding-3` / `rerank` / `glm-4.5-air`）
   - 向量数据库二选一（见下）
3. 向量数据库方案：
   - **方案 A（本地 Docker）**：安装 Docker Desktop（需 WSL2），`docker compose up -d --wait --wait-timeout 180` 启动 Milvus 三件套
   - **方案 B（Zilliz Cloud 托管，免 Docker）**：注册 <https://cloud.zilliz.com.cn> 创建免费 Serverless 集群，把「连接」页的 URI 与 API Key 填入 `.env` 的 `MILVUS_ADDRESS` / `MILVUS_TOKEN`

## 启动步骤（Windows PowerShell）

```powershell
# 1. 安装依赖
uv sync

# 2. 方案 A 需先启动 Milvus（etcd + MinIO + Milvus）；方案 B 跳过
docker compose up -d --wait --wait-timeout 180

# 3. 检查环境、导入样例、启动服务
uv run python scripts/doctor.py
uv run python scripts/seed.py
uv run uvicorn app.main:app --reload --port 1111
```

打开 <http://localhost:1111>。服务器部署时由 nginx 将 `http://<IP>/rag/` 反代到该端口（见 `DEPLOYMENT.md`）。

> 📦 完整部署步骤（环境准备、启动、运维、FAQ、生产化建议）见 **[DEPLOYMENT.md](DEPLOYMENT.md)**。

> 说明：本项目的 `app/config.py` 会在存在 `.env` 时自动加载（python-dotenv），
> 因此 PowerShell 下无需手动 `source .env`；与源项目（仅读环境变量）行为向后兼容。

## API 接口清单

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | /api/health | 无 | 健康检查 |
| GET | /api/session/users | 无 | 演示用户列表（身份切换器） |
| GET | /api/documents | 任意用户 | 当前身份可见的生效文档 |
| GET | /api/documents/{id}/versions | admin | 文档全部历史版本 |
| GET | /api/documents/{id}/raw | admin | 当前生效版本原始 Markdown（前端预览/编辑） |
| POST | /api/documents | admin | multipart 上传 Markdown 建文档（≤2MB、UTF-8、.md） |
| PUT | /api/documents/{id} | admin | 发布新版本（上传表单与编辑器共用） |
| DELETE | /api/documents/{id} | admin | 软删除 |
| POST | /api/knowledge/query | 任意用户 | 知识问答（body: {question}） |
| GET | / | 无 | 静态前端 |

## 离线验证

不调用真实 API、不启动 Milvus 时，可运行离线单元测试：

```powershell
uv run python -m unittest discover -s tests
```

## 验证清单（端到端）

1. `scripts/doctor.py` 四项检查全部 PASS。
2. `scripts/seed.py` 首次导入 5 份文档，重复执行全部 `skipped`。
3. 浏览器打开前端：切换四种身份，文档列表随之变化。
4. 非 admin 身份上传文档返回 403；admin 可上传 / 更新 / 删除。
5. 蓝鲸员工看不到星河文档；蓝鲸财务看不到客服部「仅部门」文档。
6. 以客服身份提问「3000 元退款需要人工审核吗？」返回 `answered` 且带引用来源。
7. 提问知识库之外的问题（如星河活动编号）返回拒答。
8. 管理员在文档卡片点击「编辑」：右侧抽屉打开 Markdown 原文，可直接修改，保存后发布新版本（与「发布新版本」同一逻辑）。

## 设计要点

- **权限在召回前生效**：Milvus Filter 随检索表达式下发，杜绝事后过滤泄露；`tenant_id` 为分区键。
- **版本与去重**：SHA-256 checksum + 元数据联合判断，内容未变跳过向量化；新版本激活失败自动回滚旧版本。
- **软删除**：仅将生效 Chunk 置为不可检索，历史版本与原始 md 保留于 `storage/documents/`。
- **来源可信**：模型只返回 Chunk ID，最终来源由服务端从候选集重新绑定。
- **演示级设计**：单进程 per-document 锁、硬编码演示用户，生产化需替换为分布式锁与真实鉴权（与源项目一致）。
