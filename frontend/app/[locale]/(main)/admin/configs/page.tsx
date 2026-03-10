"use client";

import { redirect } from "next/navigation";
import { useLocale } from "next-intl";

export default function AdminConfigsRedirect() {
  const locale = useLocale();
  redirect(`/${locale}/settings/configs`);
}
