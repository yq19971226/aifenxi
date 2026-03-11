"use client";

import { redirect } from "next/navigation";
import { useLocale } from "next-intl";

/** @deprecated Merged into /admin/setup — this redirect preserves old bookmarks */
export default function AdminPushRedirect() {
  const locale = useLocale();
  redirect(`/${locale}/admin/setup`);
}
