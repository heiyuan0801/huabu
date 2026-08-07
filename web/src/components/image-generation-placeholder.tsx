import { ImageIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export function ImageGenerationPlaceholder({ className, overlay = false }: { className?: string; overlay?: boolean }) {
    const reduceMotion = useReducedMotion();

    return (
        <div className={cn("relative flex h-full w-full items-center justify-center overflow-hidden", overlay ? "bg-background/65 backdrop-blur-[1px]" : "bg-muted/30", className)}>
            <motion.div
                className="absolute inset-y-0 -left-1/3 w-1/3 bg-foreground/[0.055] blur-2xl"
                animate={reduceMotion ? undefined : { x: ["0%", "400%"] }}
                transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.15 }}
            />
            <motion.div
                className="absolute inset-x-[12%] top-[34%] h-px bg-foreground/10"
                animate={reduceMotion ? undefined : { y: [0, 80, 0], opacity: [0.2, 0.7, 0.2] }}
                transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity }}
            />
            <motion.div
                animate={reduceMotion ? undefined : { opacity: [0.35, 0.8, 0.35], scale: [0.96, 1.04, 0.96] }}
                transition={{ duration: 2.1, ease: "easeInOut", repeat: Infinity }}
            >
                <ImageIcon className="size-8 text-muted-foreground" />
            </motion.div>
        </div>
    );
}
