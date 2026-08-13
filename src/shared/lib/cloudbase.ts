import cloudbase from '@cloudbase/js-sdk';

/**
 * CloudBase 前端配置（公开配置，可随源码发布）：
 * - publishable key 为「匿名角色」公开密钥，仅用于浏览器端 SDK 初始化；
 * - 业务鉴权由 auth 云函数自行校验（用户名密码 + 自签 Token）。
 */
const CLOUDBASE_ENV_ID = 'kits-dev-d4g4yxxnw8e41a263';
const CLOUDBASE_REGION = 'ap-shanghai';
const CLOUDBASE_PUBLISH_KEY =
  'eyJhbGciOiJSUzI1NiIsImtpZCI6IjQ5OGIzYTRjLWNhNmItNDlkNS1hZGMyLTI1MmNiODIyZWYyMiJ9.eyJpc3MiOiJodHRwczovL2tpdHMtZGV2LWQ0ZzR5eHhudzhlNDFhMjYzLmFwLXNoYW5naGFpLnRjYi1hcGkudGVuY2VudGNsb3VkYXBpLmNvbSIsInN1YiI6ImFub24iLCJhdWQiOiJraXRzLWRldi1kNGc0eXh4bnc4ZTQxYTI2MyIsImV4cCI6NDA5MDI3MjI0MiwiaWF0IjoxNzg2NTg5MDQyLCJub25jZSI6IjFiTnBfNVpHUkJLSW1DaVJpcWdwVlEiLCJhdF9oYXNoIjoiMWJOcF81WkdSQktJbUNpUmlxZ3BWUSIsIm5hbWUiOiJBbm9ueW1vdXMiLCJzY29wZSI6ImFub255bW91cyIsInByb2plY3RfaWQiOiJraXRzLWRldi1kNGc0eXh4bnc4ZTQxYTI2MyIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJyb2xlIjoiYW5vbiIsImlzX2Fub255bW91cyI6dHJ1ZSwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiYW5vbnltb3VzIiwicHJvdmlkZXJzIjpbImFub255bW91cyJdfSwidXNlcl9tZXRhZGF0YSI6eyJuYW1lIjoiQW5vbnltb3VzIn0sInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZhbHNlfQ.OD3Ycun51ms1AH5VYMsfZrQNX4LDjHmakdI6-NrCAGdqUwVeGOk6CEcbrifR92HvF5JqZgQL8fTbyzlqv2EsqgkQbnG6GCBWxxGm1f-hnyTRbLF2oZLz5YoHZkjEnPO-7F-Ytmun0NCFWreA_7wzLBGA25-c6rRlJBrtHE0DHdyrm6GRmj5SqY913GAIXSHzI9k-nZoFyteZlBgk_VxWCNURHd5G931cuO_WwxpCb6CQLNtKdmZqBeiszRIn4HY7KdezRFFBHG21zlqaklWNFSMsFybu0WYBU4Cyc-_5z1jB2PricjLX9UkwT8uFgI8wDFsuLchQSa-WLqsSe4llMg';

type CloudbaseApp = ReturnType<typeof cloudbase.init>;

let app: CloudbaseApp | null = null;

/** 获取全局唯一的 CloudBase 实例（懒初始化，避免重复 init）。 */
export function getCloudbaseApp(): CloudbaseApp {
  if (!app) {
    app = cloudbase.init({
      env: CLOUDBASE_ENV_ID,
      region: CLOUDBASE_REGION,
      accessKey: CLOUDBASE_PUBLISH_KEY,
      auth: { detectSessionInUrl: true },
    });
  }
  return app;
}

/**
 * 确保存在网关可识别的会话：浏览器端调用云函数前需先建立匿名会话。
 * 幂等：已有会话则直接返回，否则发起匿名登录（需控制台开启「匿名登录」）。
 */
export async function ensureCloudbaseSession(): Promise<void> {
  const auth = getCloudbaseApp().auth();
  const session = await auth.getSession();
  if (session.error) {
    throw session.error;
  }
  if (session.data?.session) {
    return;
  }
  const { error } = await auth.signInAnonymously();
  if (error) {
    throw error;
  }
}

/**
 * 调用云函数并解析统一响应（{ code, message, data }）。
 * 兼容 v3 SDK「返回值平铺在响应顶层」与旧版「包在 result 字段」两种形态；
 * 非 0 时抛出带真实错误消息的 Error。
 */
export async function callCloudFunction<T>(
  name: string,
  payload: Record<string, unknown>,
): Promise<T> {
  await ensureCloudbaseSession();
  const response = await getCloudbaseApp().callFunction({ name, data: payload });
  const raw = response as unknown as
    | { code?: unknown; message?: unknown; data?: unknown }
    | { result?: unknown };
  let result: { code?: unknown; message?: unknown; data?: unknown } | undefined;
  if (raw && typeof raw === 'object' && 'code' in raw) {
    result = raw as { code?: unknown; message?: unknown; data?: unknown };
  } else if (raw && 'result' in raw) {
    const inner = (raw as { result: unknown }).result;
    if (typeof inner === 'string') {
      try {
        result = JSON.parse(inner) as { code?: unknown; message?: unknown; data?: unknown };
      } catch {
        result = undefined;
      }
    } else {
      result = inner as { code?: unknown; message?: unknown; data?: unknown } | undefined;
    }
  }
  if (!result || typeof result.code !== 'number') {
    throw new Error('云函数返回异常，请稍后重试');
  }
  if (result.code !== 0) {
    const message = typeof result.message === 'string' ? result.message : '请求失败，请稍后重试';
    throw new Error(message);
  }
  return result.data as T;
}
