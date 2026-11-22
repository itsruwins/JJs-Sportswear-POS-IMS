"use client";

import { LogOutButton } from "@/features/customer/shell/components/log-out-button";
import { PageHeader, pageShell } from "@/features/customer/shell/components/page-parts";
import {PhotoSection} from '../utils/photo-section';
import {DetailsSection} from '../utils/details-section'
import {Props} from '../types/personal-type'
import {PasswordSection} from '../utils/password-section'

export function AccountView(p: Props) {
  return (
    <div className={pageShell}>
      <PageHeader title="Account" sub="The details the shop sees when you order or message them." />
      <div className="flex max-w-[40rem] flex-col gap-12">
        <PhotoSection {...p} />
        <DetailsSection {...p} />
        <PasswordSection />
        <section aria-labelledby="leave-title">
          <h2 id="leave-title" className="sr-only">
            Log out
          </h2>
          <p className="text-[0.875rem] text-ink-2">Member since {p.joined}</p>
          <LogOutButton className="mt-4" />
        </section>
      </div>
    </div>
  );
}

