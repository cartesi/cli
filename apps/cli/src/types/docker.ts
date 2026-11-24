/**
 * A partial representation of the metadata produced by `docker buildx build --metadata-file`.
 *
 */
export type BuildxMetadata = {
    /**
     * The manifest digest. SHA256 of the manifest JSON, which describes the image's
     * layers and points to the config blob.
     */
    "containerimage.digest"?: string | null;

    /**
     *  the image id of the built image. SHA256 of the image config JSON,
     *  which contains the layer diff IDs, env, entrypoint, cmd, etc.
     */
    "containerimage.config.digest"?: string | null;

    /**
     * The name/tag of the image if specified (e.g., via `-t` or `name=...`).
     * This is explicitly null if no image name/tag was designated for the build.
     */
    "image.name"?: string | null;
};
