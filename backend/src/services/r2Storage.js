import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

let client;

export function isR2Configured() {
  return Boolean(env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey && env.r2BucketName);
}

export function requireR2Configured() {
  if (!isR2Configured()) throw new Error("R2 credentials and bucket must be configured.");
}

export function getR2Client() {
  requireR2Configured();
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: env.r2EndpointUrl || `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }
  return client;
}

export function getR2BucketName() {
  requireR2Configured();
  return env.r2BucketName;
}

export async function createReelPutUrl(objectKey, contentType, contentLength, expiresIn = 600) {
  const command = new PutObjectCommand({
    Bucket:getR2BucketName(),
    Key:objectKey,
    ContentType:contentType,
    ContentLength:contentLength,
  });
  return getSignedUrl(getR2Client(), command, { expiresIn });
}

export async function headR2Object(objectKey) {
  return getR2Client().send(new HeadObjectCommand({ Bucket:getR2BucketName(), Key:objectKey }));
}

export async function getR2Object(objectKey) {
  return getR2Client().send(new GetObjectCommand({ Bucket:getR2BucketName(), Key:objectKey }));
}

export async function putR2Object(objectKey, body, contentType, contentLength) {
  return getR2Client().send(new PutObjectCommand({
    Bucket:getR2BucketName(),
    Key:objectKey,
    Body:body,
    ContentType:contentType,
    ContentLength:contentLength,
  }));
}

export async function deleteR2Object(objectKey) {
  return getR2Client().send(new DeleteObjectCommand({ Bucket:getR2BucketName(), Key:objectKey }));
}
