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
