import type { DescMessage, DescMethodBiDiStreaming } from "@bufbuild/protobuf";
import type { Client, Transport } from "@connectrpc/connect";
import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";

import { MIN_API_VERSION } from "../app/capabilities";
import {
  Connection,
  DeprecatedWarning,
  Group,
  GroupItem,
  LogLevel,
  ServiceStatus,
  ServiceStatus_Type,
  StartedService,
  Status,
  TailscaleEndpointStatus,
  USBIPServerStatus,
  type OpenConnectEndpointStatus,
  type OpenVPNEndpointStatus,
} from "../gen/daemon/started_service_pb";
import {
  openBidirectionalStream,
  type BidirectionalStream,
  type BidirectionalStreamHandlers,
} from "./bidirectional";
import { serverConnectUrl, type Server } from "./config";
import { StreamStore } from "./stream";
import type { PagedTable } from "./retainedData";

export const STATUS_HISTORY_LENGTH = 30;

export interface ServiceStatusData {
  status: ServiceStatus | null;
}

export interface StatusData {
  current: Status | null;
  uplinkHistory: number[];
  downlinkHistory: number[];
}

export interface GroupsData {
  groups: Group[];
  loaded: boolean;
}

export interface ClashModeData {
  modeList: string[];
  currentMode: string;
  loaded: boolean;
}

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
}

export interface LogsData {
  entries: LogEntry[];
  defaultLevel: LogLevel | null;
}

export interface ConnectionRow {
  connection: Connection;
  uplinkRate: number;
  downlinkRate: number;
  uplinkTotal: bigint;
  downlinkTotal: bigint;
  closedAt: number | null;
}

export interface ConnectionsData {
  rows: ReadonlyMap<string, ConnectionRow> | PagedTable<ConnectionRow>;
  loaded: boolean;
}

export interface OutboundsData {
  outbounds: GroupItem[];
  loaded: boolean;
}

export interface TailscaleData {
  endpoints: TailscaleEndpointStatus[];
  loaded: boolean;
}

export interface UsbipData {
  servers: USBIPServerStatus[];
  loaded: boolean;
}

export interface OpenConnectData {
  endpoints: OpenConnectEndpointStatus[];
  loaded: boolean;
}

export interface OpenVPNData {
  endpoints: OpenVPNEndpointStatus[];
  loaded: boolean;
}

export interface ServerInfo {
  version: string;
  apiVersion: number;
}

const SUBSCRIPTION_INTERVAL = 1_000_000_000n;

export class DaemonApi {
  readonly config: Server;
  readonly client: Client<typeof StartedService>;
  private readonly bidirectionalTransport: Transport | undefined;
  private readonly language: string;

  readonly serviceStatus: StreamStore<ServiceStatusData>;
  readonly status: StreamStore<StatusData>;
  readonly groups: StreamStore<GroupsData>;
  readonly clashMode: StreamStore<ClashModeData>;
  readonly logs: StreamStore<LogsData>;
  readonly connections: StreamStore<ConnectionsData>;
  readonly outbounds: StreamStore<OutboundsData>;
  readonly tailscale: StreamStore<TailscaleData>;
  readonly usbip: StreamStore<UsbipData>;
  readonly openConnect: StreamStore<OpenConnectData>;
  readonly openVPN: StreamStore<OpenVPNData>;

  private logSequence = 0;
  private versionCache: ServerInfo | null = null;

  constructor(config: Server, language: string, transport?: Transport) {
    this.config = config;
    this.language = language;
    this.bidirectionalTransport = transport ? withLanguageHeader(transport, language) : undefined;
    this.client = createClient(
      StartedService,
      this.bidirectionalTransport ??
        createGrpcWebTransport({
          baseUrl: serverConnectUrl(config.url),
          interceptors: [
            (next) => (request) => {
              request.header.set("Accept-Language", language);
              if (config.secret) {
                request.header.set("Authorization", `Bearer ${config.secret}`);
              }
              return next(request);
            },
          ],
        }),
    );
    this.serviceStatus = new StreamStore<ServiceStatusData>(
      () => ({ status: null }),
      async ({ signal, update }) => {
        for await (const message of this.client.subscribeServiceStatus({}, { signal })) {
          update((data) => ({ ...data, status: message }));
        }
      },
    );

    this.status = new StreamStore<StatusData>(
      () => ({ current: null, uplinkHistory: [], downlinkHistory: [] }),
      async ({ signal, update }) => {
        const { appendStatus } = await import("./streamData");
        if (signal.aborted) return;
        for await (const message of this.client.subscribeStatus(
          { interval: SUBSCRIPTION_INTERVAL },
          { signal },
        )) {
          update((data) => appendStatus(data, message));
        }
      },
    );

    this.groups = new StreamStore<GroupsData>(
      () => ({ groups: [], loaded: false }),
      async ({ signal, update }) => {
        for await (const message of this.client.subscribeGroups({}, { signal })) {
          update(() => ({ groups: message.group, loaded: true }));
        }
      },
    );

    this.clashMode = new StreamStore<ClashModeData>(
      () => ({ modeList: [], currentMode: "", loaded: false }),
      async ({ signal, update }) => {
        const initial = await this.client.getClashModeStatus({}, { signal });
        update(() => ({
          modeList: initial.modeList,
          currentMode: initial.currentMode,
          loaded: true,
        }));
        for await (const message of this.client.subscribeClashMode({}, { signal })) {
          update((data) => ({ ...data, currentMode: message.mode }));
        }
      },
    );

    let compactUnusedLogs = (data: LogsData): LogsData => data;
    this.logs = new StreamStore<LogsData>(
      () => ({ entries: [], defaultLevel: null }),
      async ({ signal, update }) => {
        const { appendLogs, logLevel, compactLogs } = await import("./streamData");
        if (signal.aborted) return;
        compactUnusedLogs = compactLogs;
        let levelFetched = false;
        const fetchDefaultLevel = () => {
          const statusType = this.serviceStatus.getSnapshot().data.status?.status;
          if (
            levelFetched ||
            (statusType !== ServiceStatus_Type.STARTING &&
              statusType !== ServiceStatus_Type.STARTED)
          ) {
            return;
          }
          levelFetched = true;
          void this.client.getDefaultLogLevel({}, { signal }).then(
            (defaultLevel) => update((data) => logLevel(data, defaultLevel.level)),
            () => {
              levelFetched = false;
            },
          );
        };
        const unsubscribeStatus = this.serviceStatus.subscribe(fetchDefaultLevel);
        try {
          for await (const message of this.client.subscribeLog({}, { signal })) {
            if (message.reset) {
              levelFetched = false;
              fetchDefaultLevel();
            }
            const sequence = this.logSequence;
            this.logSequence += message.messages.length;
            update((data) => appendLogs(data, (function* () {
              for (let index = 0; index < message.messages.length; index++) {
                const messageEntry = message.messages[index];
                yield { id: sequence + index, level: messageEntry.level, message: messageEntry.message };
              }
            })(), message.reset));
          }
        } finally {
          unsubscribeStatus();
        }
      },
      false,
      true,
      // Preserve diagnostics even if the core is unavailable on the next visit.
      (data) => compactUnusedLogs(data),
    );

    this.connections = new StreamStore<ConnectionsData>(
      () => ({ rows: new Map(), loaded: false }),
      async ({ signal, update }) => {
        const { appendConnections } = await import("./streamData");
        if (signal.aborted) return;
        for await (const message of this.client.subscribeConnections(
          { interval: SUBSCRIPTION_INTERVAL }, { signal },
        )) update((data) => appendConnections(data, message));
      },
      true,
      // The core may GC its closed-connection cache. A mounted connection view
      // must keep receiving history while hidden; a resubscribe cannot recover it.
      false,
    );

    this.outbounds = new StreamStore<OutboundsData>(
      () => ({ outbounds: [], loaded: false }),
      async ({ signal, update }) => {
        for await (const message of this.client.subscribeOutbounds({}, { signal })) {
          update(() => ({ outbounds: message.outbounds, loaded: true }));
        }
      },
      false, true, true,
    );

    this.tailscale = new StreamStore<TailscaleData>(
      () => ({ endpoints: [], loaded: false }),
      async ({ signal, update }) => {
        for await (const message of this.client.subscribeTailscaleStatus({}, { signal })) {
          update(() => ({ endpoints: message.endpoints, loaded: true }));
        }
      },
      false, true, true,
    );

    this.usbip = new StreamStore<UsbipData>(
      () => ({ servers: [], loaded: false }),
      async ({ signal, update }) => {
        const { apiVersion } = await this.serverInfo();
        if (apiVersion < MIN_API_VERSION.usbip) {
          throw new ConnectError(
            `requires server API version ${MIN_API_VERSION.usbip}`,
            Code.Unimplemented,
          );
        }
        for await (const message of this.client.subscribeUSBIPServerStatus({}, { signal })) {
          update(() => ({ servers: message.servers, loaded: true }));
        }
      },
      false, true, true,
    );

    this.openConnect = new StreamStore<OpenConnectData>(
      () => ({ endpoints: [], loaded: false }),
      async ({ signal, update }) => {
        await this.requireApiVersion(MIN_API_VERSION.openVpnAndOpenConnect);
        for await (const message of this.client.subscribeOpenConnectStatus({}, { signal })) {
          update(() => ({ endpoints: message.endpoints, loaded: true }));
        }
      },
      true,
    );

    this.openVPN = new StreamStore<OpenVPNData>(
      () => ({ endpoints: [], loaded: false }),
      async ({ signal, update }) => {
        await this.requireApiVersion(MIN_API_VERSION.openVpnAndOpenConnect);
        for await (const message of this.client.subscribeOpenVPNStatus({}, { signal })) {
          update(() => ({ endpoints: message.endpoints, loaded: true }));
        }
      },
      true,
    );
  }

  openBidirectionalStream<I extends DescMessage, O extends DescMessage>(
    method: DescMethodBiDiStreaming<I, O>,
    handlers: BidirectionalStreamHandlers<O>,
  ): BidirectionalStream<I> {
    return openBidirectionalStream(
      this.config,
      this.language,
      method,
      handlers,
      this.bidirectionalTransport,
    );
  }

  retryNow(): void {
    this.serviceStatus.retryNow();
    this.status.retryNow();
    this.groups.retryNow();
    this.clashMode.retryNow();
    this.logs.retryNow();
    this.connections.retryNow();
    this.outbounds.retryNow();
    this.tailscale.retryNow();
    this.usbip.retryNow();
    this.openConnect.retryNow();
    this.openVPN.retryNow();
  }

  reconnectNow(preserveConnectionHistory = false): void {
    this.serviceStatus.reconnectNow();
    this.status.reconnectNow();
    this.groups.reconnectNow();
    this.clashMode.reconnectNow();
    this.logs.reconnectNow();
    this.connections.reconnectNow(preserveConnectionHistory);
    this.outbounds.reconnectNow();
    this.tailscale.reconnectNow();
    this.usbip.reconnectNow();
  }

  async urlTest(outboundTag: string): Promise<void> {
    await this.client.uRLTest({ outboundTag });
  }

  async selectOutbound(groupTag: string, outboundTag: string): Promise<void> {
    await this.client.selectOutbound({ groupTag, outboundTag });
  }

  async setGroupExpand(groupTag: string, isExpand: boolean): Promise<void> {
    await this.client.setGroupExpand({ groupTag, isExpand });
  }

  async setClashMode(mode: string): Promise<void> {
    await this.client.setClashMode({ mode });
  }

  async closeConnection(id: string): Promise<void> {
    await this.client.closeConnection({ id });
  }

  async closeAllConnections(): Promise<void> {
    await this.client.closeAllConnections({});
  }

  async clearLogs(): Promise<void> {
    await this.client.clearLogs({});
  }

  async serverInfo(): Promise<ServerInfo> {
    if (!this.versionCache) {
      const response = await this.client.getVersion({});
      this.versionCache = { version: response.version, apiVersion: response.apiVersion };
    }
    return this.versionCache;
  }

  private async requireApiVersion(min: number): Promise<void> {
    const { apiVersion } = await this.serverInfo();
    if (apiVersion < min) {
      throw new ConnectError(`requires server API version ${min}`, Code.Unimplemented);
    }
  }

  async getStartedAt(): Promise<number> {
    const response = await this.client.getStartedAt({});
    return Number(response.startedAt);
  }

  async getDeprecatedWarnings(): Promise<DeprecatedWarning[]> {
    const response = await this.client.getDeprecatedWarnings({});
    return response.warnings;
  }

  async setTailscaleExitNode(endpointTag: string, stableID: string): Promise<void> {
    await this.client.setTailscaleExitNode({ endpointTag, stableID });
  }

  async tailscaleLogout(endpointTag: string): Promise<void> {
    await this.client.tailscaleLogout({ endpointTag });
  }
}

function withLanguageHeader(transport: Transport, language: string): Transport {
  const addLanguage = (header: HeadersInit | undefined) => {
    const result = new Headers(header);
    result.set("Accept-Language", language);
    return result;
  };
  return {
    unary: (method, signal, timeoutMs, header, input, contextValues) =>
      transport.unary(method, signal, timeoutMs, addLanguage(header), input, contextValues),
    stream: (method, signal, timeoutMs, header, input, contextValues) =>
      transport.stream(method, signal, timeoutMs, addLanguage(header), input, contextValues),
  };
}
