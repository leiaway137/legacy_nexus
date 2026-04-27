"use client";

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/routing';
import { ChangeEvent, useTransition } from 'react';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();

  function onSelectChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value as 'en' | 'zh';
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <label className="relative flex items-center h-full">
      <p className="sr-only">Change language</p>
      <select
        className="appearance-none bg-transparent py-1 pl-3 pr-7 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition cursor-pointer outline-none focus:ring-2 focus:ring-blue-500"
        defaultValue={locale}
        disabled={isPending}
        onChange={onSelectChange}
      >
        <option value="en" className="text-black dark:text-white bg-white dark:bg-zinc-900">EN</option>
        <option value="zh" className="text-black dark:text-white bg-white dark:bg-zinc-900">中文</option>
      </select>
      <span className="pointer-events-none absolute right-2.5 top-[8px] text-[10px] text-zinc-500">
        ▼
      </span>
    </label>
  );
}
