# Deploying to Vercel

This guide will help you deploy the Battery Fleet Monitoring Dashboard to Vercel.

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. Your project pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Deployment Steps

### Option 1: Deploy via Vercel CLI (Recommended)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy from your project directory**:
   ```bash
   cd /Users/harshpandey/PycharmProjects/Location_anamoly
   vercel
   ```

4. **Follow the prompts**:
   - Set up and deploy? **Yes**
   - Which scope? (Select your account)
   - Link to existing project? **No** (for first deployment)
   - Project name? (Press Enter for default or enter a custom name)
   - Directory? (Press Enter for `./`)
   - Override settings? **No**

5. **Set Environment Variables**:
   After the first deployment, you'll need to add your environment variables:
   ```bash
   vercel env add DB_HOST
   vercel env add DB_NAME
   vercel env add DB_USER
   vercel env add DB_PASS
   vercel env add TABLE_NAME
   ```
   
   For each variable, enter the value when prompted.

6. **Redeploy with environment variables**:
   ```bash
   vercel --prod
   ```

### Option 2: Deploy via Vercel Dashboard

1. **Push your code to Git**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Import Project in Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your Git repository
   - Vercel will auto-detect Next.js

3. **Configure Project**:
   - Framework Preset: **Next.js** (auto-detected)
   - Root Directory: `./` (default)
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)
   - Install Command: `npm install` (default)

4. **Add Environment Variables**:
   - Go to Project Settings → Environment Variables
   - Add the following variables (for Production, Preview, and Development):
     - `DB_HOST` - Your database host (e.g., `i0xwrv7gwd.t7uc1w0ave.tsdb.cloud.timescale.com:31750`)
     - `DB_NAME` - Your database name
     - `DB_USER` - Your database user
     - `DB_PASS` - Your database password
     - `TABLE_NAME` - Your table name (e.g., `iot.bms_telemetry`)
     - `NEXTAUTH_SECRET` - A random string (min 32 chars)
     - `NEXTAUTH_URL` - Your Vercel URL (e.g., `https://your-project.vercel.app`)

5. **Deploy**:
   - Click "Deploy"
   - Wait for the build to complete
   - Your app will be live at `https://your-project.vercel.app`

## Important Notes

### Database Connection

- The database connection is optimized for serverless environments
- Connection pooling is limited to 1 connection per serverless function
- The connection will timeout after 10 seconds

### Environment Variables

Make sure to set environment variables for all environments:
- **Production**: Used for production deployments
- **Preview**: Used for preview deployments (PR previews)
- **Development**: Used for local development with `vercel dev`

### Custom Domain

After deployment, you can add a custom domain:
1. Go to Project Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions

### Monitoring

- Check the Vercel dashboard for deployment logs
- Monitor function execution times and errors
- Set up alerts for failed deployments

## Troubleshooting

### Build Failures

If the build fails:
1. Check the build logs in Vercel dashboard
2. Ensure all dependencies are in `package.json`
3. Verify TypeScript compilation passes locally: `npm run build`

### Database Connection Issues

If you see database connection errors:
1. Verify environment variables are set correctly
2. Check that your database allows connections from Vercel's IP ranges
3. Ensure SSL is enabled (it's configured in the code)
4. Verify the hostname and port are correct

### Function Timeout

If functions timeout:
1. Check database query performance
2. Consider adding database indexes
3. Optimize queries if needed

## Updating Your Deployment

After making changes:

```bash
git add .
git commit -m "Your changes"
git push
```

Vercel will automatically deploy on push to your main branch, or create preview deployments for pull requests.

## Local Development with Vercel

To test locally with Vercel's environment:

```bash
vercel dev
```

This will use your Vercel environment variables locally.

