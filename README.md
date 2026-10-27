# May Route Dashboard

May Route 的内嵌管理界面，展示概览、代理组、连接、日志、配置及故障切换设置。界面由 desktop 提供本地桥接和核心状态；它不是独立部署的监控站点，也不是供公网开放的无鉴权代理控制台。

[English](README.en.md) · [配套开发](docs/INTEGRATION.zh-CN.md) · [May Route 使用教程](https://github.com/mxh110708/may-route-desktop/blob/custom-main/docs/USER-GUIDE.zh-CN.md)

## 配套与范围

本仓库作为 [desktop](https://github.com/mxh110708/may-route-desktop) 的 `dashboard/` 子模块固定提交。当前产品文档基线为 May Route 1.14.2-may.26。最终用户只安装 desktop 发行包，不需要另外启动 Vite 或单独安装本仓库。

本界面支持简体中文与英文。概览中的规则／全局／直连是路由选择，系统代理／TUN 是流量接管；实际监测组和编辑下拉分别处理。完整功能与诊断以 desktop 文档和后端状态为准，UI 显示不改变服务端权限或配置来源身份。

## 开发

React／TypeScript／Vite，使用 `package.json` 固定的 pnpm 11.19.0 与锁文件。优先在 desktop 的固定子模块布局开发，以获得相同生成协议、桥接和打包环境。独立 `pnpm dev` 只启动开发前端，不创建 Windows 服务或完整桌面后端。

协议生成、类型检查、测试、构建及子模块更新说明见[配套开发](docs/INTEGRATION.zh-CN.md)。纯文档修改不自动变更父仓库已固定的 gitlink，也不证明已发布安装包包含这些新文档。

源自 [SagerNet/sing-box-dashboard](https://github.com/SagerNet/sing-box-dashboard)，不是官方 SagerNet 发行。保留 [LICENSE](LICENSE)、版权及命名条件；不在仓库保存私人配置、节点 Token、密钥或签名材料。
