"use client";

import { Drawer } from "antd";
import { Megaphone } from "lucide-react";
import Link from "next/link";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    return (
        <Drawer title="导航" placement="left" size={280} open={open} onClose={onClose} className="md:hidden">
            <div className="space-y-1">
                <div className="mb-3 flex items-start gap-2 rounded-lg bg-stone-50 px-3 py-2.5 text-sm text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                    <Megaphone className="mt-0.5 size-4 shrink-0" />
                    <span>未来中转站 QQ 交流群：901256496</span>
                </div>
                {navigationTools.map((tool) => {
                    const Icon = tool.icon;
                    const active = tool.slug === activeToolSlug;
                    return (
                        <Link
                            key={tool.slug}
                            href={`/${tool.slug}`}
                            onClick={onClose}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-3 text-base transition",
                                active ? "bg-stone-100 font-medium text-stone-950 dark:bg-stone-800 dark:text-stone-100" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100",
                            )}
                        >
                            <Icon className="size-5" />
                            <span>{tool.label}</span>
                        </Link>
                    );
                })}
            </div>
        </Drawer>
    );
}
