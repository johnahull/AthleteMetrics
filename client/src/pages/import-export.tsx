import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CloudUpload, Download, Copy, Info, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { downloadCSV } from "@/lib/csv";

export default function ImportExport() {
  const [importType, setImportType] = useState<"players" | "measurements">("players");
  const [importMode, setImportMode] = useState<"match" | "create">("match");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [importResults, setImportResults] = useState<any>(null);
  const { toast } = useToast();

  const { data: teams } = useQuery({
    queryKey: ["/api/teams"],
  });

  const importMutation = useMutation({
    mutationFn: async ({ file, type, mode, teamId }: { 
      file: File; 
      type: string; 
      mode: string; 
      teamId?: string; 
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (mode === 'create' && teamId) {
        formData.append('teamId', teamId);
      }
      formData.append('createMissing', mode === 'create' ? 'true' : 'false');

      const response = await fetch(`/api/import/${type}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Import failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setImportResults(data);
      toast({
        title: "Import Complete",
        description: `Processed ${data.totalRows} rows. ${data.results.length} valid, ${data.errors.length} errors.`,
      });
    },
    onError: () => {
      toast({
        title: "Import Failed",
        description: "Failed to process CSV file",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setImportResults(null);
    }
  };

  const handleImport = () => {
    if (!uploadFile) {
      toast({
        title: "Error",
        description: "Please select a file to import",
        variant: "destructive",
      });
      return;
    }

    if (importMode === "create" && !selectedTeamId) {
      toast({
        title: "Error", 
        description: "Please select a team for creating missing players",
        variant: "destructive",
      });
      return;
    }

    importMutation.mutate({
      file: uploadFile,
      type: importType,
      mode: importMode,
      teamId: selectedTeamId,
    });
  };

  const handleExport = async (exportType: string) => {
    try {
      const response = await fetch(`/api/export/${exportType}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      const csvData = await response.text();
      downloadCSV(csvData, `${exportType}.csv`);
      
      toast({
        title: "Success",
        description: `${exportType} data exported successfully`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: `Failed to export ${exportType} data`,
        variant: "destructive",
      });
    }
  };

  const playersTemplate = `firstName,lastName,birthYear,teamName,school
Mia,Chen,2009,Lonestar 09G Navy,Westlake HS
Elise,Ramos,2008,Thunder Elite,Anderson HS
Jordan,Williams,2009,Lightning 08G,Lake Travis HS`;

  const measurementsTemplate = `fullName,birthYear,date,metric,value,units,flyInDistance,notes
Mia Chen,2009,2025-01-20,FLY10_TIME,1.26,s,20,Electronic gates
Elise Ramos,2008,2025-01-19,VERTICAL_JUMP,21.5,in,,Jump mat
Jordan Williams,2009,2025-01-18,FLY10_TIME,1.31,s,15,Manual timing`;

  const copyToClipboard = (text: string, name: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${name} template copied to clipboard`,
    });
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Import & Export Data</h1>

        {/* Import Section */}
        <Card className="bg-white mb-8">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Import Data</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Players Import */}
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-4">Import {importType === "players" ? "Players" : "Measurements"}</h4>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Import Type</label>
                  <Select value={importType} onValueChange={(value) => setImportType(value as "players" | "measurements")}>
                    <SelectTrigger data-testid="select-import-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="players">Players</SelectItem>
                      <SelectItem value="measurements">Measurements</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div 
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('file-upload')?.click()}
                  data-testid="file-drop-zone"
                >
                  <CloudUpload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">
                    {uploadFile ? uploadFile.name : `Drop your ${importType} CSV file here, or`}
                  </p>
                  <Button variant="ghost" className="text-primary hover:text-blue-700 font-medium">
                    click to browse
                  </Button>
                  <p className="text-xs text-gray-500 mt-2">Supports CSV and XLSX files</p>
                  
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleFileUpload}
                    className="hidden"
                    data-testid="input-file-upload"
                  />
                </div>

                <div className="mt-4">
                  <Button
                    variant="ghost"
                    onClick={() => copyToClipboard(
                      importType === "players" ? playersTemplate : measurementsTemplate,
                      importType
                    )}
                    className="text-primary hover:text-blue-700 text-sm"
                    data-testid="button-download-template"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download {importType} template
                  </Button>
                </div>
              </div>

              {/* Import Options */}
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-4">Import Options</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Import Mode</label>
                    <div className="space-y-3">
                      <label className="flex items-center space-x-3">
                        <input 
                          type="radio" 
                          name="import-mode" 
                          value="match" 
                          checked={importMode === "match"}
                          onChange={(e) => setImportMode(e.target.value as "match" | "create")}
                          className="text-primary focus:ring-primary"
                          data-testid="radio-match-players"
                        />
                        <span className="text-sm text-gray-700">Match players by fullName + birthYear</span>
                      </label>
                      <label className="flex items-center space-x-3">
                        <input 
                          type="radio" 
                          name="import-mode" 
                          value="create" 
                          checked={importMode === "create"}
                          onChange={(e) => setImportMode(e.target.value as "match" | "create")}
                          className="text-primary focus:ring-primary"
                          data-testid="radio-create-players"
                        />
                        <span className="text-sm text-gray-700">Create missing players and assign to team:</span>
                      </label>
                    </div>
                  </div>

                  {importMode === "create" && (
                    <div className="ml-6">
                      <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                        <SelectTrigger className="w-48" data-testid="select-team-import">
                          <SelectValue placeholder="Select team..." />
                        </SelectTrigger>
                        <SelectContent>
                          {teams?.map((team) => (
                            <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button 
                    onClick={handleImport}
                    disabled={!uploadFile || importMutation.isPending}
                    className="w-full"
                    data-testid="button-import"
                  >
                    {importMutation.isPending ? "Importing..." : "Import Data"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Import Results */}
            {importResults && (
              <div className="mt-6 p-4 border border-gray-200 rounded-lg">
                <h5 className="font-medium text-gray-900 mb-3">Import Results</h5>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-900">{importResults.totalRows}</p>
                    <p className="text-gray-600">Total Rows</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{importResults.results.length}</p>
                    <p className="text-gray-600">Valid</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600">{importResults.errors.length}</p>
                    <p className="text-gray-600">Errors</p>
                  </div>
                </div>
                
                {importResults.errors.length > 0 && (
                  <div className="mt-4">
                    <h6 className="font-medium text-red-800 mb-2">Errors:</h6>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {importResults.errors.slice(0, 5).map((error, index) => (
                        <p key={index} className="text-sm text-red-600">
                          Row {index + 1}: {error.error}
                        </p>
                      ))}
                      {importResults.errors.length > 5 && (
                        <p className="text-sm text-gray-500">... and {importResults.errors.length - 5} more errors</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* CSV Templates */}
        <Card className="bg-white mb-8">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">CSV Templates & Examples</h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Players Template */}
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-4">Players CSV Format</h4>
                <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm">
                  <div className="text-gray-600 mb-2"># players.csv</div>
                  <pre className="whitespace-pre-wrap">{playersTemplate}</pre>
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-xs text-gray-500">Required: firstName, lastName, birthYear, teamName</span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(playersTemplate, "Players")}
                    data-testid="button-copy-players-template"
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>

              {/* Measurements Template */}
              <div>
                <h4 className="text-md font-medium text-gray-700 mb-4">Measurements CSV Format</h4>
                <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm">
                  <div className="text-gray-600 mb-2"># measurements.csv</div>
                  <pre className="whitespace-pre-wrap">{measurementsTemplate}</pre>
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-xs text-gray-500">Required: fullName, birthYear, date, metric, value • Optional: flyInDistance (for fly 10 times)</span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(measurementsTemplate, "Measurements")}
                    data-testid="button-copy-measurements-template"
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-blue-600 mt-1 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Import Guidelines:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Metric values: FLY10_TIME (seconds) or VERTICAL_JUMP (inches)</li>
                    <li>• Units will be auto-detected if missing (s for FLY10_TIME, in for VERTICAL_JUMP)</li>
                    <li>• FlyInDistance optional field (in yards) for FLY10_TIME measurements only</li>
                    <li>• Date format: YYYY-MM-DD</li>
                    <li>• Player matching is case-sensitive</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export Section */}
        <Card className="bg-white">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Export Data</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-6 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Download className="h-6 w-6 text-blue-600" />
                </div>
                <h4 className="font-medium text-gray-900 mb-2">Export Players</h4>
                <p className="text-sm text-gray-600 mb-4">Download all player information including team assignments</p>
                <Button 
                  onClick={() => handleExport("players")}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  data-testid="button-export-players"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Players CSV
                </Button>
              </div>

              <div className="text-center p-6 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Download className="h-6 w-6 text-green-600" />
                </div>
                <h4 className="font-medium text-gray-900 mb-2">Export Measurements</h4>
                <p className="text-sm text-gray-600 mb-4">Download all measurement data with current filters applied</p>
                <Button 
                  onClick={() => handleExport("measurements")}
                  className="w-full bg-green-600 hover:bg-green-700"
                  data-testid="button-export-measurements"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Measurements CSV
                </Button>
              </div>

              <div className="text-center p-6 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Download className="h-6 w-6 text-purple-600" />
                </div>
                <h4 className="font-medium text-gray-900 mb-2">Full Export</h4>
                <p className="text-sm text-gray-600 mb-4">Download complete database backup including all teams and data</p>
                <Button 
                  onClick={() => {
                    handleExport("players");
                    handleExport("measurements");
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  data-testid="button-export-all"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export All Data
                </Button>
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-1 flex-shrink-0" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">Export Notes:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Exported files will include all data visible in your current view/filters</li>
                    <li>• Use the analytics page filters to customize what gets exported</li>
                    <li>• Full export includes all teams, players, and measurements</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
