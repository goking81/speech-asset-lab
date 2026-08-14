import { NextResponse } from 'next/server';

/** 云端试用版不提供本机文件、OCR、备份和恢复相关接口。 */
export function cloudTrialUnavailableResponse() {
  return NextResponse.json(
    {
      code: 'CLOUD_TRIAL_LOCAL_FEATURE_UNAVAILABLE',
      error: '内置资产试用版不提供本机导入、PDF 解析、OCR、备份或恢复。',
    },
    { status: 410 },
  );
}
