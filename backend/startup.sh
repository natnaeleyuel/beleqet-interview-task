#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Running seed..."
npx prisma db seed || echo "Seed failed (non-fatal)"

echo "Starting app..."
exec npm run start:prod
