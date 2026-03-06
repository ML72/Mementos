# Azure Deployment Setup Guide

Complete step-by-step guide for deploying the Mementos application to Azure App Service. This guide combines first-time setup with reference information for ongoing management.

## Prerequisites ✅

Before starting, make sure you have:

- GitHub repository access with admin permissions
- Azure account with active subscription
- Azure CLI installed ([Download](https://aka.ms/installazurecliwindows))
- MongoDB connection string (Atlas or Azure CosmosDB)

**Time Required:** ~45-60 minutes for first deployment

---

## Development Environment Setup

### 1. Install & Login to Azure (5 minutes)

**Windows:** Download from https://aka.ms/installazurecliwindows  
**Mac:** `brew install azure-cli`  
**Linux:** `curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash`

```bash
# Login and select subscription
az login
az account list --output table
az account set --subscription "<YOUR-SUBSCRIPTION-ID>"
```

### 2. Create Azure Resources (10 minutes)

```bash
# Create resource group
az group create --name rg-mementos-dev --location eastus

# Register for the web resource provider (once per subscription)
az provider register --namespace Microsoft.Web

# Create App Service Plan (F1 = Free tier; B1 = Basic tier, ~$13/month)
az appservice plan create \
  --name plan-mementos-dev \
  --resource-group rg-mementos-dev \
  --sku F1 \
  --is-linux \
  --location eastus

# Create Web App (name must be globally unique!)
az webapp create \
  --name mementos-dev \
  --resource-group rg-mementos-dev \
  --plan plan-mementos-dev \
  --runtime "NODE:20-lts"

# Configure startup command
az webapp config set \
  --name mementos-dev \
  --resource-group rg-mementos-dev \
  --startup-file "npm start"
```

### 3. Set Environment Variables (5 minutes)

**Generate a secure JWT secret:**
```bash
# Linux/Mac:
openssl rand -base64 32

# Windows PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

**Configure app settings:**
```bash
az webapp config appsettings set \
  --name mementos-dev \
  --resource-group rg-mementos-dev \
  --settings \
    NODE_ENV="production" \
    MONGO_URI="<YOUR-MONGODB-CONNECTION-STRING>" \
    JWT_SECRET="<PASTE-GENERATED-SECRET-HERE>" \
    PORT="8080"
```

### 4. Create Service Principal for GitHub (5 minutes)

```bash
# Get your subscription ID
SUBSCRIPTION_ID=$(az account show --query id --output tsv)
echo "Subscription ID: $SUBSCRIPTION_ID"

# Create service principal
az ad sp create-for-rbac \
  --name "github-mementos-dev" \
  --role contributor \
  --scopes /subscriptions/$SUBSCRIPTION_ID/resourceGroups/rg-mementos-dev \
  --sdk-auth
```

**📋 Copy the entire JSON output** - you'll need it for GitHub!

### 5. Configure GitHub Secrets (5 minutes)

Go to: **GitHub Repo → Settings → Secrets and variables → Actions → New repository secret**

Add these **three** secrets:

| Secret Name | Value |
|-------------|-------|
| `AZURE_CREDENTIALS_dev` | Paste the full JSON from Step 4 |
| `AZURE_WEBAPP_NAME_dev` | `mementos-dev` |
| `AZURE_WEBAPP_URL_dev` | `https://mementos-dev.azurewebsites.net` |

Note that this section only concerns the `dev` environment. Three similar secrets are required for other environments, such as `prod`.

### 6. Push Environment Branch (5 minutes)

Push code to `env-dev` branch to automatically deploy!

**Monitor:** GitHub → Actions tab → Watch deployment progress

**Verify:** Visit `https://mementos-dev.azurewebsites.net`

---

## Production Environment Setup

After dev is working, create production with these differences:

### Production Resources

```bash
# Production uses Premium tier (P1V2 = ~$92/month) for better performance
az group create --name rg-mementos-prod --location eastus

az appservice plan create \
  --name plan-mementos-prod \
  --resource-group rg-mementos-prod \
  --sku P1V2 \
  --is-linux \
  --location eastus

az webapp create \
  --name mementos-prod \
  --resource-group rg-mementos-prod \
  --plan plan-mementos-prod \
  --runtime "NODE:20-lts"

az webapp config set \
  --name mementos-prod \
  --resource-group rg-mementos-prod \
  --startup-file "npm start"
```

### Production Configuration

**Important differences from dev:**
- ✅ Use a **different** JWT_SECRET
- ✅ Use a **separate** MongoDB database
- ✅ Enable "Always On" for better performance

```bash
# Set environment variables
az webapp config appsettings set \
  --name mementos-prod \
  --resource-group rg-mementos-prod \
  --settings \
    NODE_ENV="production" \
    MONGO_URI="YOUR_PROD_MONGODB_STRING" \
    JWT_SECRET="DIFFERENT_SECRET_THAN_DEV" \
    PORT="8080"

# Enable Always On (keeps app warm, no cold starts)
az webapp config set \
  --name mementos-prod \
  --resource-group rg-mementos-prod \
  --always-on true
```

### Production GitHub Setup

```bash
# Create service principal for production
SUBSCRIPTION_ID=$(az account show --query id --output tsv)

az ad sp create-for-rbac \
  --name "github-mementos-prod" \
  --role contributor \
  --scopes /subscriptions/$SUBSCRIPTION_ID/resourceGroups/rg-mementos-prod \
  --sdk-auth
```

Add these GitHub secrets:
- `AZURE_CREDENTIALS_prod` (JSON output)
- `AZURE_WEBAPP_NAME_prod` (your prod app name)
- `AZURE_WEBAPP_URL_prod` (your prod URL)

Create production branch:
```bash
git checkout -b env-prod
git push -u origin env-prod
```

---

## Reference Information

### Azure SKU Options

| Tier | SKU | Monthly Cost | Best For | Features |
|------|-----|--------------|----------|----------|
| Basic | B1 | ~$13 | Dev/Test | Basic compute |
| Standard | S1 | ~$69 | Staging | Custom domains, SSL |
| Premium | P1V2 | ~$92 | Production | Always On, auto-scaling |

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `MONGO_URI` | MongoDB connection | `mongodb+srv://...` |
| `JWT_SECRET` | Token signing secret | Random base64 string |
| `PORT` | Port number | `8080` (Azure default) |

### GitHub Secrets Pattern

For each environment (dev, prod, staging):
- `AZURE_CREDENTIALS_{ENV}` - Service principal JSON
- `AZURE_WEBAPP_NAME_{ENV}` - Azure Web App name  
- `AZURE_WEBAPP_URL_{ENV}` - Full app URL

### Branch Strategy

- `main` - Development work
- `env-dev` - Triggers deployment to dev environment
- `env-prod` - Triggers deployment to production
- `env-staging` - Optional staging environment

---

## Troubleshooting

### Deployment succeeds but app shows error

**Check Azure logs:**
```bash
az webapp log tail \
  --name mementos-dev \
  --resource-group rg-mementos-dev
```

**Common causes:**
- Missing environment variables
- Incorrect MongoDB connection string

### GitHub Actions fails

**Verify:**
1. GitHub secrets are named exactly right (case-sensitive)
2. Service principal JSON is complete
3. Web App name matches secret

### MongoDB connection fails

**For MongoDB Atlas:**
1. Go to **Network Access** in Atlas
2. Add IP address: `0.0.0.0/0` (allow Azure connections)
3. Verify connection string includes username/password

### Health check fails

App might be starting up (cold start). Wait 60 seconds and try again:
```bash
curl https://mementos-dev.azurewebsites.net
```

---

## Useful Commands

```bash
# View app status
az webapp show \
  --name mementos-dev \
  --resource-group rg-mementos-dev \
  --query state

# Restart app
az webapp restart \
  --name mementos-dev \
  --resource-group rg-mementos-dev

# Stream logs
az webapp log tail \
  --name mementos-dev \
  --resource-group rg-mementos-dev

# Download logs
az webapp log download \
  --name mementos-dev \
  --resource-group rg-mementos-dev \
  --log-file logs.zip

# View all app settings
az webapp config appsettings list \
  --name mementos-dev \
  --resource-group rg-mementos-dev

# SSH into container (for debugging)
az webapp ssh \
  --name mementos-dev \
  --resource-group rg-mementos-dev
```

---

## Scaling & Performance

### Vertical Scaling (More Power)

```bash
# Upgrade to Standard tier
az appservice plan update \
  --name plan-mementos-prod \
  --resource-group rg-mementos-prod \
  --sku S1
```

### Horizontal Scaling (More Instances)

```bash
# Scale to 3 instances
az appservice plan update \
  --name plan-mementos-prod \
  --resource-group rg-mementos-prod \
  --number-of-workers 3
```

### Auto-scaling (Premium tier only)

```bash
# Enable auto-scaling based on CPU
az monitor autoscale create \
  --resource-group rg-mementos-prod \
  --resource mementos-prod \
  --resource-type Microsoft.Web/sites \
  --name autoscale-mementos \
  --min-count 1 \
  --max-count 5 \
  --count 1

az monitor autoscale rule create \
  --resource-group rg-mementos-prod \
  --autoscale-name autoscale-mementos \
  --condition "Percentage CPU > 70 avg 5m" \
  --scale out 1
```

---

## Cost Optimization

**Save money on development:**
```bash
# Stop dev app when not in use
az webapp stop \
  --name mementos-dev \
  --resource-group rg-mementos-dev

# Start it again when needed
az webapp start \
  --name mementos-dev \
  --resource-group rg-mementos-dev
```

**Monthly cost estimates:**
- Development (B1): ~$13
- Production (P1V2): ~$92
- MongoDB Atlas (free tier): $0
- MongoDB Atlas (shared): ~$9-25
- Bandwidth: Usually included

---

## Security Checklist

Before going to production:

- [ ] Strong, unique JWT_SECRET for each environment
- [ ] MongoDB connection uses SSL/TLS
- [ ] Network access restricted in MongoDB Atlas
- [ ] Service principal has minimal required permissions
- [ ] Environment variables not committed to Git
- [ ] HTTPS enabled (automatic in Azure)
- [ ] Different databases for dev and prod
- [ ] Production branch requires approval (GitHub settings)

---

## Next Steps

- **Monitoring:** Set up Azure Application Insights for detailed metrics
- **Custom Domain:** Add your own domain name in Azure Portal
- **Deployment Slots:** Use slots for zero-downtime deployments
- **Backup Strategy:** Configure automated backups
- **CI/CD Testing:** Add test stage before deployment

---

## Quick Reference Card

```bash
# Deploy to dev
git checkout env-dev && git merge main && git push

# Deploy to prod  
git checkout env-prod && git merge env-dev && git push

# View logs
az webapp log tail --name <app-name> --resource-group <rg-name>

# Restart app
az webapp restart --name <app-name> --resource-group <rg-name>

# Check status
az webapp show --name <app-name> --resource-group <rg-name> --query state
```

**Need help?** Check logs first, then review [troubleshooting section](#troubleshooting) above.

---
