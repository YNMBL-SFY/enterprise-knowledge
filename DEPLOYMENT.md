# 部署指南（Deployment Guide）

企业知识库（enterprise-knowledge）部署文档。适用于 **Windows**（本机验证环境）与 **Linux / macOS**（命令差异处已标注）。

## 1. 架构总览

| 组件 | 技术 | 作用 | 端口 |
|------|------|------|------|
| Web 应用 | FastAPI + Uvicorn（Python 3.12） | API + 静态前端 | 1111 |
| 向量数据库 | Milvus 2.6.18（standalone） | 稠密向量 + BM25 混合检索 | 19530 |
| 元数据存储 | etcd 3.5（Milvus 依赖） | Milvus 元数据 | 内部 |
| 对象存储 | MinIO（Milvus 依赖） | Milvus 数据落盘 | 9000/9001 |
| AI 能力 | 智谱开放平台（embedding-3 / rerank / glm-4.5-air） | 向量化 / 精排 / 问答生成 | HTTPS |

etcd、MinIO、Milvus 由 `docker-compose.yml` 一键启动；FastAPI 应用以 `uv` 管理依赖、`uvicorn` 运行。

## 2. 前置条件

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| Docker Desktop | 任意近期版本 | 需启用 WSL2 后端（Windows）；Linux/macOS 用 Docker Engine |
| uv | 0.5+ | 依赖管理；自动下载合适版本 Python（本项目锁定 CPython 3.12） |
| 智谱 API Key | - | <https://open.bigmodel.cn/> 申请；模型需覆盖 `embedding-3`、`rerank`、`glm-4.5-air` |

验证命令：

```bash
docker version && docker compose version
uv --version
```

## 3. 部署步骤

### 3.1 获取项目

项目目录：`D:\webSelf\AI-demo\enterprise-knowledge`（或克隆/复制到目标机器）。

### 3.2 配置环境变量

```bash
# 复制模板（Windows PowerShell / Linux 相同）
copy .env.example .env
```

编辑 `.env`，至少填写：

```ini
ZHIPU_API_KEY=your-api-key-here        # 必填：智谱开放平台 Key
EMBEDDING_MODEL=embedding-3            # 可选，默认
EMBEDDING_DIMENSIONS=512               # 可选，默认；只能取 256/512/1024/2048
RERANK_MODEL=rerank                    # 可选，默认
CHAT_MODEL=glm-4.5-air                 # 可选，默认（有专项资源包可用）
MILVUS_ADDRESS=127.0.0.1:19530         # 本地默认；Zilliz Cloud 填托管地址
MILVUS_COLLECTION=enterprise_knowledge_chunks
# MILVUS_TOKEN=                        # 使用 Zilliz Cloud 时填写
PORT=1111                              # 服务端口
```

> ⚠️ `.env` 含密钥，已在 `.gitignore` 中排除，请勿提交仓库。
> 若已在 Collection 中使用过某维度，`EMBEDDING_DIMENSIONS` 不能随意修改（见 5.4）。

### 3.3 安装依赖

```bash
cd D:\webSelf\AI-demo\enterprise-knowledge
uv sync
```

安装完成后生成 `uv.lock` 与 `.venv`。

### 3.4 启动 Milvus（etcd + MinIO + Milvus）

```bash
docker compose up -d --wait --wait-timeout 180
```

首次运行会拉取约 3GB 镜像，请保持网络畅通。完成后确认三容器健康：

```bash
docker compose ps
# 期望：etcd / minio / standalone 均为 Up ... (healthy)
```

### 3.5 环境检查

```bash
uv run python scripts/doctor.py
```

期望四项全部 `PASS`：Python 版本、ZHIPU_API_KEY、Embedding 维度、Milvus 连接。

### 3.6 导入样例文档（可选但推荐）

```bash
uv run python scripts/seed.py
```

导入 5 份跨租户/跨部门样例文档；重复执行会因内容未变而全部 `skipped`。

### 3.7 启动 Web 服务

```bash
# 前台（开发调试，Ctrl+C 停止）
uv run uvicorn app.main:app --reload --port 1111

# 后台（Windows PowerShell）
Start-Process -FilePath "uv" -ArgumentList @("run","uvicorn","app.main:app","--host","0.0.0.0","--port","1111") -WorkingDirectory (Get-Location) -WindowStyle Hidden

# 后台（Linux/macOS）
nohup uv run uvicorn app.main:app --host 0.0.0.0 --port 1111 > uvicorn.log 2>&1 &
```

> 内网/演示用 `--host 0.0.0.0` 可被局域网访问；仅本机使用保持默认 127.0.0.1。

### 3.8 验证部署

```bash
# 1) 服务存活
curl http://127.0.0.1:1111/api/health
# {"status":"ok","service":"enterprise-knowledge-base",...}

# 2) 演示用户列表
curl http://127.0.0.1:1111/api/session/users

# 3) 文档列表（蓝鲸管理员）
curl -H "Authorization: Bearer demo-bluewhale-admin" http://127.0.0.1:1111/api/documents

# 4) 知识问答
curl -X POST http://127.0.0.1:1111/api/knowledge/query \
  -H "Authorization: Bearer demo-bluewhale-customer-service" \
  -H "Content-Type: application/json" \
  -d '{"question":"退款金额超过多少元必须进入人工审核流程？"}'
```

浏览器打开 <http://localhost:1111>：切换四种身份、查看文档列表、上传/编辑/删除文档、发起知识问答。

## 4. 日常运维

```bash
# 查看容器状态
docker compose ps

# 停止容器（保留数据）
docker compose stop

# 重新启动容器
docker compose start

# 查看应用日志（Linux 后台运行场景）
tail -f uvicorn.log

# 完全重置（删除容器 + 数据卷 + 应用本地存储，谨慎！）
docker compose down -v
Remove-Item -Recurse -Force storage, volumes   # Windows；Linux 用 rm -rf
uv run python scripts/seed.py                  # 重新导入样例
```

## 5. 常见问题（FAQ）

### 5.1 Milvus 连接失败 / doctor.py 该项 FAIL
- 确认 `docker compose ps` 三容器均为 healthy（Milvus 冷启动约 1~2 分钟）。
- 确认 `.env` 的 `MILVUS_ADDRESS` 与容器暴露端口一致（默认 127.0.0.1:19530）。
- 使用 Zilliz Cloud 时确认 `MILVUS_ADDRESS` / `MILVUS_TOKEN` 与控制台「连接」页一致（见第 8 节）。

### 5.2 问答报 503 / 「答案生成失败：429」
- 智谱模型限流（code 1305「访问量过大」），属外部瞬时状态，稍后重试即可；代码内置指数退避重试。
- 确认 Key 对应资源包覆盖 `embedding-3` / `rerank` / `glm-4.5-air` 三个模型（可在智谱控制台查看）。

### 5.3 偶发「无法回答」拒答
- 系统提示要求模型只能依据召回 Chunk 回答（防幻觉）；当 Rerank 候选与该问题相关性不足或语义边界模糊时，模型会保守拒答，属预期行为。
- 换用与资料表述一致的问题（如「退款超过多少元必须人工审核」）通常可正常回答。

### 5.4 修改 EMBEDDING_DIMENSIONS 后启动报错
- Collection 已按旧维度建好，改维度会导致 schema 不匹配。需删库重建：
  ```bash
  # 方式一：改 Collection 名（推荐，保留旧数据）
  #   .env 中 MILVUS_COLLECTION=enterprise_knowledge_chunks_v2
  # 方式二：drop 后重建
  uv run python -c "from app.config import load_config; from app.milvus_store import MilvusStore; s=MilvusStore(load_config()); s.client.drop_collection(s.collection_name)"
  ```

### 5.5 端口 1111 被占用
- 修改 `.env` 的 `PORT`，或 `netstat -ano | findstr :1111` 找到 PID 后结束进程。

### 5.6 PowerShell 控制台中文乱码
- 仅显示问题，不影响数据。执行 `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)` 后再运行命令。

### 5.7 Docker CLI 提示找不到 docker
- Windows 下 Docker Desktop 安装后 PATH 可能未刷新，使用完整路径调用，或重开终端：
  ```powershell
  C:\Users\<用户名>\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe version
  ```

## 6. 生产化改造方向（当前为演示级）

- **鉴权**：硬编码演示用户（`app/auth.py`）替换为真实登录体系（JWT/OIDC），token 与租户/部门/角色绑定。
- **并发**：单进程 per-document 锁（`app/document_service.py`）在多实例下需替换为分布式锁或任务队列。
- **数据库**：本地 Milvus standalone 可升级为 Milvus 集群或 Zilliz Cloud（代码已兼容 `MILVUS_TOKEN`）。
- **部署形态**：`uvicorn` 建议用 gunicorn（多 worker）或容器化（Dockerfile + Compose 应用服务）；前端静态资源可挂 CDN。
- **安全**：CORS 白名单当前面向本地 5173，生产需收紧为真实域名；上传大小/类型校验可再加白名单与病毒扫描。

## 7. 目录速查

```
enterprise-knowledge/
├── docker-compose.yml      # etcd + MinIO + Milvus
├── pyproject.toml / uv.lock
├── .env / .env.example     # 环境变量（.env 已 gitignore）
├── app/
│   ├── main.py             # FastAPI 入口（9 个接口）
│   ├── config.py           # 配置加载（.env 自动加载）
│   ├── document_service.py # 入库/版本/软删除/原始 md 读取
│   ├── knowledge_service.py# 问答流水线
│   ├── milvus_store.py     # Milvus 访问层
│   ├── ai_service.py       # 智谱模型封装
│   └── static/             # 前端
├── scripts/                # doctor.py / seed.py
├── sample_documents/       # 样例文档
├── tests/                  # 离线单测
├── storage/documents/      # 运行时：原始 Markdown 落盘（gitignore）
└── volumes/                # 运行时：Docker 数据卷（gitignore）
```

## 8. 备选部署：Zilliz Cloud 免费托管（免 Docker）

不装 Docker、不在服务器上跑数据库的托管方案：Milvus 官方云服务，**注册即可创建免费 Serverless 集群**（国内建议选中国区 <https://cloud.zilliz.com.cn>）。本项目所有特性（BM25 全文检索、混合检索 RRF、分区键、partial upsert）均已实测兼容，**代码零改动**。

1. 注册并创建免费 **Serverless 集群**（中国区选杭州等节点）。
2. 在集群「连接」页复制 URI 与 API Key。
3. 配置 `.env`（关键：URI 原样粘贴即可，PyMilvus 自动兼容；Token 用裸 Key 即可）：

```ini
MILVUS_ADDRESS=https://in03-xxxx.serverless.ali-cn-hangzhou.cloud.zilliz.com.cn/v2/vectordb/collections/list
MILVUS_TOKEN=<控制台 API Key>
MILVUS_COLLECTION=enterprise_knowledge_chunks
```

4. 其余步骤与本地一致（跳过 docker 相关命令），并推荐使用 `scripts/deploy_server.sh` 一键部署（装 uv + nginx + systemd 常驻 + `/rag/` 反代）：

```bash
bash scripts/deploy_server.sh
```

部署完成后：
- 服务常驻监听 **127.0.0.1:1111**（systemd 管理，`journalctl -u enterprise-knowledge -f` 看日志）
- **nginx 监听 80**：`http://<服务器IP>/rag/` 反代到后端（前端已改用相对路径，无需额外配置）
- 腾讯云安全组只需放行 **TCP 80 入站**

> 注意：免费 Serverless 集群有 CU 用量与数据量上限，长期闲置可能暂停；生产请评估按量/包年计费。API Key 为敏感凭证，勿提交仓库、勿在公开渠道粘贴。
