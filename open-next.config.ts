// OpenNext 在 Cloudflare Workers 中打包 Next.js；本试用版不启用 R2/ISR 缓存或其他付费绑定。
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
