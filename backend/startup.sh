#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Running seed..."
npx prisma db seed

echo "Starting app..."
npm run start:prod
