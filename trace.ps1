$root = "C:\internship-app-college\node_modules\react-native-blob-util"
"=== getConstants call sites in react-native-blob-util ==="
Get-ChildItem -Path $root -Filter "*.js" -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(android|ios|windows)\\' } | ForEach-Object {
        $hits = Select-String -Path $_.FullName -Pattern "getConstants" -ErrorAction SilentlyContinue
        foreach ($h in $hits) {
            "{0}:{1}: {2}" -f $_.Name, $h.LineNumber, $h.Line.Trim()
        }
    }

""
"=== how the native module is obtained ==="
Get-ChildItem -Path $root -Filter "*.js" -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(android|ios|windows)\\' } | ForEach-Object {
        $hits = Select-String -Path $_.FullName -Pattern "NativeModules\.|TurboModuleRegistry" -ErrorAction SilentlyContinue
        foreach ($h in $hits) {
            "{0}:{1}: {2}" -f $_.Name, $h.LineNumber, $h.Line.Trim()
        }
    }
