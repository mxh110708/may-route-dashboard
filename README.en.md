# May Route Dashboard

Embedded UI for May Route overview, groups, connections, logs, configuration and failover settings. The desktop provides its local bridge and core state; this is not a standalone monitoring site or a public unauthenticated proxy console.

[简体中文](README.md) · [Integration](docs/INTEGRATION.zh-CN.md) · [User guide](https://github.com/mxh110708/may-route-desktop/blob/custom-main/docs/USER-GUIDE.en.md)

The desktop repository pins this repository as its `dashboard/` submodule. The product documentation baseline is 1.14.2-may.26. End users install the desktop Release, not a separate Dashboard server.

The interface supports Simplified Chinese and English. Routing mode and traffic capture are separate controls. Actual monitored groups differ from the group currently viewed in the editor; the backend remains authoritative.

Development uses React/TypeScript/Vite, pnpm 11.19.0 and the committed lockfile. Prefer the fixed desktop submodule layout for generated protocols, bridge and packaging. A standalone Vite server does not create Windows services or the full application backend.

Documentation-only edits do not automatically change the parent's pinned gitlink or the source provenance of published binaries. See the [desktop developer guide](https://github.com/mxh110708/may-route-desktop/blob/custom-main/docs/DEVELOPMENT.zh-CN.md).

Derived from [SagerNet/sing-box-dashboard](https://github.com/SagerNet/sing-box-dashboard), retaining [license and attribution](LICENSE). Do not commit private profiles, tokens, keys or signing material.
