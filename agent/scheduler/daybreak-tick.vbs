' Runs one Daybreak pass with no window, for Windows Task Scheduler. Output goes to data\runner.log.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
shell.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.Run "cmd /c node notary.mjs daybreak tick >> data\runner.log 2>&1", 0, True
