Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\qwert\Desktop\covo\src-tauri\icons\icon.png"
$dstPath = "C:\Users\qwert\Desktop\covo\src-tauri\icons\icon-unread.png"

$img = [System.Drawing.Image]::FromFile($srcPath)
$bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Draw original image
$g.DrawImage($img, 0, 0, $img.Width, $img.Height)

# Calculate badge size and position
# User wants it smaller (e.g. 15% instead of a huge one) and top right.
$diameter = [int]($img.Width * 0.18)
$margin = [int]($img.Width * 0.04)
$x = $img.Width - $diameter - $margin
$y = $margin

$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Red)
$g.FillEllipse($brush, $x, $y, $diameter, $diameter)

# White border for better quality look
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [float]($img.Width * 0.02))
$g.DrawEllipse($pen, $x, $y, $diameter, $diameter)

$bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$img.Dispose()
$brush.Dispose()
$pen.Dispose()

Write-Host "icon-unread.png generated successfully."
