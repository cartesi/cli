/**
 * Splits a number of bytes into the largest IEC unit that divides it exactly, e.g. 4194304 is
 * 4 "Mi", and 1000 is 1000 "".
 */
export const splitSize = (bytes: number): { value: number; unit: string } => {
    let value = bytes;
    let unit = "";
    for (const next of ["Ki", "Mi", "Gi", "Ti"]) {
        if (value === 0 || value % 1024 !== 0) {
            break;
        }
        value /= 1024;
        unit = next;
    }
    return { value, unit };
};

/**
 * Formats a number of bytes as a size cartesi.toml accepts, e.g. "4Mi".
 */
export const formatSize = (bytes: number): string => {
    const { value, unit } = splitSize(bytes);
    return `${value}${unit}`;
};
