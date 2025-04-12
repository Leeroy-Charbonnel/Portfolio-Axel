import {
    animate,
    useInView,
    useIsomorphicLayoutEffect,
} from "framer-motion";
import { useRef } from "react";

type AnimatedCounterProps = {
    from: number;
    to: number;
    duration?: number;
};

const formatNumber = (num: number): string => {
    if (num >= 1000000) {
        return `${(num / 1000000).toFixed(2)}M`;
    }
    if (num >= 10000) {
        return `${(num / 1000).toFixed(2)}k`;
    }
    if (num >= 1000) {
        return `${(num / 1000).toFixed(2)}k`;
    }
    return num.toString();
};

const AnimatedCounter = ({
    from,
    to,
    duration,
}: AnimatedCounterProps) => {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true });

    useIsomorphicLayoutEffect(() => {
        const element = ref.current;

        if (!element) return;
        if (!inView) return;

        // Set initial value
        element.textContent = String(from);

        // If reduced motion is enabled in system's preferences
        if (window.matchMedia("(prefers-reduced-motion)").matches) {
            element.textContent = String(to);
            return;
        }

        const controls = animate(from, to, {
            duration: duration || 5,
            ease: "easeOut",
            onUpdate(value) {
                element.textContent = formatNumber(value);
            },
        });

        // Cancel on unmount
        return () => {
            controls.stop();
        };
    }, [ref, inView, from, to]);

    return <span ref={ref} />;
};

export default AnimatedCounter;