/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Type errors fail the build. `tsc --noEmit` is clean as of this commit —
    // keep it that way rather than re-enabling this suppression.
    ignoreBuildErrors: false,
  },
  eslint: {
    // Lint errors fail the build. NOTE: ESLint is not currently installed or
    // configured in this project, so nothing is linted yet — this flag exists
    // so that adding an ESLint config later enforces it instead of silently
    // being ignored.
    ignoreDuringBuilds: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
