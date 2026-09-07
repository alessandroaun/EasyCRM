Set objFSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

' 1. Mata qualquer ConectorZap fantasma que tenha ficado preso no Gerenciador de Tarefas
On Error Resume Next
WshShell.Run "taskkill /F /IM ConectorZap.exe /T", 0, True
On Error GoTo 0

' 2. Pega a pasta atual e define como diretório de trabalho
strPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath

' 3. Inicia o sistema limpo de forma invisível
WshShell.Run chr(34) & strPath & "\ConectorZap.exe" & Chr(34), 0

Set WshShell = Nothing
Set objFSO = Nothing