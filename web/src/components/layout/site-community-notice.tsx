import { Button, Modal } from "antd";
import { ExternalLink, Megaphone } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCopyText } from "@/hooks/use-copy-text";

const NOTICE_STORAGE_KEY = "future-canvas:community-notice:v1";
const QQ_GROUP = "901256496";

export function SiteCommunityNotice() {
    const { t } = useTranslation();
    const copyText = useCopyText();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        try {
            if (window.localStorage.getItem(NOTICE_STORAGE_KEY) !== "1") setOpen(true);
        } catch {
            setOpen(true);
        }
    }, []);

    const close = () => {
        try {
            window.localStorage.setItem(NOTICE_STORAGE_KEY, "1");
        } catch {
            // The footer remains available when browser storage is unavailable.
        }
        setOpen(false);
    };

    return (
        <>
            <footer className="flex h-8 shrink-0 items-center justify-center border-t border-border bg-background px-3 text-xs text-muted-foreground">
                <button type="button" className="inline-flex min-w-0 items-center gap-1.5 truncate transition hover:text-foreground" onClick={() => setOpen(true)}>
                    <Megaphone className="size-3.5 shrink-0" />
                    <span className="truncate">{t("siteNotice.footer", { group: QQ_GROUP })}</span>
                </button>
            </footer>
            <Modal title={t("siteNotice.title")} open={open} onCancel={close} footer={null} destroyOnHidden>
                <div className="space-y-5 py-2">
                    <p className="text-sm leading-6 text-muted-foreground">{t("siteNotice.description")}</p>
                    <div className="flex items-center justify-between gap-3 border-y border-border py-3">
                        <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">{t("siteNotice.qqLabel")}</div>
                            <div className="mt-1 font-mono text-base font-semibold tracking-normal">{QQ_GROUP}</div>
                        </div>
                        <Button type="text" onClick={() => copyText(QQ_GROUP, t("siteNotice.copied"))}>{t("siteNotice.copyGroup")}</Button>
                    </div>
                    <a href="https://weilai.chat" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline">
                        <ExternalLink className="size-4" />
                        {t("siteNotice.visitRelay")}
                    </a>
                </div>
            </Modal>
        </>
    );
}
