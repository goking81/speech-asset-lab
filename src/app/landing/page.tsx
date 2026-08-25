import { redirect } from 'next/navigation';

/** 保留旧链接可访问，统一回到对外首页。 */
export default function LegacyLandingPage() {
  redirect('/');
}
