# LumaFit — deploy to Cloudflare Pages, including functions/.
# The dashboard's drag-and-drop upload cannot deploy Pages Functions, so this
# stages a clean copy (public site + functions/ only — never product/, course/,
# dist/, test/, or the .md docs) and deploys it with Wrangler.
#
# First time: run `npx wrangler login` once, and make sure -ProjectName matches
# your Pages project's name in the Cloudflare dashboard (Workers & Pages).
param([string]$ProjectName = 'lumafit')

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$stage = Join-Path $src '_deploy'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory $stage | Out-Null

foreach ($f in 'index.html', 'terms.html', 'privacy.html', 'refund.html', 'thank-you.html') {
    Copy-Item (Join-Path $src $f) $stage
}
foreach ($d in 'css', 'js', 'assets', 'functions') {
    Copy-Item (Join-Path $src $d) (Join-Path $stage $d) -Recurse
}

npx wrangler pages deploy $stage --project-name $ProjectName
