
# Yaogun B-End Worktable Deploy Script
# Usage: ./deploy.ps1

# --- Configuration ---
$RemoteUser = "root"
$RemoteIP = "47.82.216.125"
$TargetDir = "/usr/share/nginx/yaogun_b_worktable"
$TempDir = "/root/dist_temp"

# --- Script Logic ---

Write-Host "1. Building project..." -ForegroundColor Green
cmd /c npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed. Please check the output above."
    exit 1
}

Write-Host "2. Uploading to Temporary Directory ($TempDir)..." -ForegroundColor Green

if (Get-Command scp -ErrorAction SilentlyContinue) {
    # Switch to dist directory
    Push-Location dist
    try {
        # Upload to temp dir (force create/overwrite)
        # Note: We upload '.' to '$TempDir'. 
        # If $TempDir doesn't exist, scp creates it and puts files inside.
        # If it exists, it puts files inside. 
        # Safe enough for temp.
        scp -r . "$RemoteUser@${RemoteIP}:${TempDir}"
    }
    finally {
        Pop-Location
    }
    
    if ($?) {
        Write-Host "Upload to Temp Complete!" -ForegroundColor Green
        
        Write-Host "3. Deploying from Temp to Target..." -ForegroundColor Green
        
        # Commands to execute on server:
        # 1. Clean target (safely)
        # 2. Copy from temp to target
        # 3. Fix permissions
        # 4. Remove temp
        $DeployCmd = "mkdir -p $TargetDir && rm -rf $TargetDir/* && cp -r $TempDir/* $TargetDir/ && chmod -R 755 $TargetDir && rm -rf $TempDir"
        
        Write-Host "Executing server commands..."
        ssh "$RemoteUser@$RemoteIP" $DeployCmd
        
        Write-Host "SUCCESS All done!" -ForegroundColor Green
        Write-Host "Please visit: http://${RemoteIP}:8081"
    }
    else {
        Write-Error "Upload failed. Please check network or SSH config."
    }
}
else {
    Write-Error "scp command not found. Please install Git Bash or OpenSSH."
}
