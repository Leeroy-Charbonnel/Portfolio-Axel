// Original Utils.ts functions
export const hexToRgb = (hex: string): number[] => {
    //Remove # if present
    hex = hex.replace(/^#/, '');

    //Parse the hex values
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    return [r, g, b];
};

export const formatNumber = (num: number): string => {
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

// New function: useIsInView hook
import { useState, useEffect, useRef, RefObject } from 'react';

export const useIsInView = (
    ref: RefObject<HTMLElement>,
    options: {
        threshold?: number;
        rootMargin?: string;
        once?: boolean;
    } = {}
): boolean => {
    const [isIntersecting, setIntersecting] = useState(false);
    const hasSeenRef = useRef(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                //If element is intersecting and we're using "once" option
                if (entry.isIntersecting && options.once) {
                    hasSeenRef.current = true;
                    setIntersecting(true);
                    observer.disconnect();
                } else if (!options.once) {
                    //Normal behavior - update state based on visibility
                    setIntersecting(entry.isIntersecting);
                }
            },
            {
                threshold: options.threshold || 0,
                rootMargin: options.rootMargin || '0px'
            }
        );

        //If using "once" option and element was already seen, don't observe again
        if (options.once && hasSeenRef.current) {
            setIntersecting(true);
            return;
        }

        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, [ref, options.threshold, options.rootMargin, options.once]);

    return isIntersecting;
};