export type S3StorageTarget = {
  bucket: string;
  region: string;
  prefix?: string;
};

export const getPlannedS3Target = (): S3StorageTarget | null => {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) {
    return null;
  }
  return {
    bucket,
    region,
    prefix: process.env.S3_PREFIX ?? "news-graph",
  };
};
