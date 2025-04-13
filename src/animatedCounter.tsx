import { formatNumber, useIsInView } from "@/utils/Utils";
import { useRef, useEffect } from "react";

type AnimatedCounterProps = {
    from: number;
    to: number;
    duration?: number;
};

//Custom hook to handle isomorphic layout effect
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useEffect : useEffect;

const AnimatedCounter = ({
    from,
    to,
    duration = 5,
}: AnimatedCounterProps) => {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useIsInView(ref, {
        once: true,
        rootMargin: '0px 0px 100px 0px' // Start animation when element is 100px below viewport
    });

    useIsomorphicLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        if (!inView) return;

        //Set initial value
        element.textContent = String(from);

        //If reduced motion is enabled in system's preferences
        if (window.matchMedia("(prefers-reduced-motion)").matches) {
            element.textContent = formatNumber(to);
            return;
        }

        //Animation variables
        let startTime: number | null = null;
        let animationFrameId: number;

        //Animation function
        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
            const currentValue = from + (to - from) * easeOut(progress);

            if (element) {
                element.textContent = formatNumber(currentValue);
            }

            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            }
        };

        //Start animation
        animationFrameId = requestAnimationFrame(animate);

        //Cleanup
        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [from, to, duration, inView]);

    return <span ref={ref} />;
};

//Ease out function - similar to Framer Motion's "easeOut"
const easeOut = (x: number): number => {
    return 1 - Math.pow(1 - x, 2);
};

export default AnimatedCounter;