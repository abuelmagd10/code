$ErrorActionPreference = "Stop"

$env:OCI_CLI_SUPPRESS_FILE_PERMISSIONS_WARNING = "True"

$compartmentId = "ocid1.tenancy.oc1..aaaaaaaap2bm2m5gggjph5yvx32uvrqks6dxtbdmmzxmecjwahrw4xydhzpq"
$availabilityDomain = "cfbv:ME-DUBAI-1-AD-1"
$vcnId = "ocid1.vcn.oc1.me-dubai-1.amaaaaaastjuzjiayqmobu7fe62hwyfe6vsndpmpno5p4sudw5t23wxxaa3q"
$routeTableId = "ocid1.routetable.oc1.me-dubai-1.aaaaaaaagt3cfgp556arg34pxbtxxcnlmd23qcnlaq363su47xl3gyvloola"
$imageId = "ocid1.image.oc1.me-dubai-1.aaaaaaaalvbe3ujvesryfdp2ahoi5d7ijcalhpk3p43qzpkzsy2moquowd3q"
$sshKeyFile = "$HOME\.ssh\abuelmagd10-code.pub"

$dateSuffix = Get-Date -Format "yyyyMMdd-HHmmss"
$securityListName = "ollama-prod-security-$dateSuffix"
$subnetName = "ollama-prod-subnet-$dateSuffix"
$instanceName = "ollama-prod-01"
$subnetDnsLabel = "ol" + (Get-Date -Format "MMddHHmmss")
$hostnameLabel = "ollama01"

$repoRoot = "C:\Users\abuel\Documents\trae_projects\ERB_VitaSlims"
$egressRules = "$repoRoot\ops\ollama\oci\new-subnet-egress.json"
$ingressRules = "$repoRoot\ops\ollama\oci\new-subnet-ingress.json"
$shapeConfig = "$repoRoot\ops\ollama\oci\shape-config-e3-4x24.json"
$summaryFile = "$repoRoot\ops\ollama\oci\new-ollama-server-summary.json"
$subnetCreateFile = "$repoRoot\ops\ollama\oci\generated-subnet-create.json"

Write-Host "Creating dedicated security list..."
$securityListCreate = oci --config-file "$HOME\.oci14\config" network security-list create `
  --compartment-id $compartmentId `
  --vcn-id $vcnId `
  --display-name $securityListName `
  --egress-security-rules ("file://$egressRules") `
  --ingress-security-rules ("file://$ingressRules")
if ($LASTEXITCODE -ne 0) { throw "Failed to create security list." }
$securityListId = (($securityListCreate | ConvertFrom-Json).data).id

Write-Host "Creating secure subnet..."
$subnetCreateBody = [ordered]@{
  compartmentId = $compartmentId
  vcnId = $vcnId
  routeTableId = $routeTableId
  securityListIds = @($securityListId)
  cidrBlock = "10.0.1.0/24"
  displayName = $subnetName
  dnsLabel = $subnetDnsLabel
}
$subnetCreateBody | ConvertTo-Json -Depth 5 | Set-Content $subnetCreateFile
$subnetCreate = oci --config-file "$HOME\.oci14\config" network subnet create `
  --from-json ("file://$subnetCreateFile")
if ($LASTEXITCODE -ne 0) { throw "Failed to create subnet." }
$subnetId = (($subnetCreate | ConvertFrom-Json).data).id

oci --config-file "$HOME\.oci14\config" network subnet get --subnet-id $subnetId `
  --wait-for-state AVAILABLE `
  --max-wait-seconds 600 `
  --wait-interval-seconds 10 | Out-Null

Write-Host "Launching new Ollama instance..."
$instanceLaunch = oci --config-file "$HOME\.oci14\config" compute instance launch `
  --availability-domain $availabilityDomain `
  --compartment-id $compartmentId `
  --subnet-id $subnetId `
  --assign-public-ip true `
  --display-name $instanceName `
  --hostname-label $hostnameLabel `
  --shape "VM.Standard.E3.Flex" `
  --shape-config ("file://$shapeConfig") `
  --image-id $imageId `
  --boot-volume-size-in-gbs 100 `
  --ssh-authorized-keys-file $sshKeyFile
if ($LASTEXITCODE -ne 0) { throw "Failed to launch instance." }
$instanceId = (($instanceLaunch | ConvertFrom-Json).data).id

oci --config-file "$HOME\.oci14\config" compute instance get --instance-id $instanceId `
  --wait-for-state RUNNING `
  --max-wait-seconds 1800 `
  --wait-interval-seconds 15 | Out-Null

Write-Host "Fetching VNIC and public IP..."
$vnicJson = oci --config-file "$HOME\.oci14\config" compute instance list-vnics --instance-id $instanceId
$vnicJson = $vnicJson | Out-String
$vnic = ($vnicJson | ConvertFrom-Json).data | Select-Object -First 1

$summary = [ordered]@{
  securityListId = $securityListId
  subnetId = $subnetId
  instanceId = $instanceId
  publicIp = $vnic.'public-ip'
  privateIp = $vnic.'private-ip'
  shape = "VM.Standard.E3.Flex"
  ocpus = 4
  memoryInGBs = 24
  imageId = $imageId
}

$summary | ConvertTo-Json -Depth 5 | Set-Content $summaryFile
$summary | ConvertTo-Json -Depth 5
