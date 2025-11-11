import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  ArrowLeft, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  Facebook,
  Upload
} from "lucide-react";

const steps = [
  {
    title: "Access Settings",
    description: "Navigate to Facebook Settings",
    details: [
      "Click on your profile picture in the top right corner",
      "Click 'Settings & privacy' from the dropdown menu",
      "Click 'Settings'",
      "Click 'Accounts Center' in the left menu"
    ]
  },
  {
    title: "Navigate to Export Your Information",
    description: "Find the data export section",
    details: [
      "In Accounts Center, click 'Your information and permissions'",
      "Click 'Export your information'",
      "Click 'Create export'",
      "Select the Facebook profile you'd like to export"
    ]
  },
  {
    title: "Choose Export Destination",
    description: "Select where to export your data",
    details: [
      "Select 'Export to device' (recommended for backup)",
      "Alternatively, select 'Export to external service' for cloud transfer",
      "Click 'Next' to proceed"
    ]
  },
  {
    title: "Customize Your Export",
    description: "Select what data and format you want",
    details: [
      "Choose specific info to export or select all",
      "Select date range (choose 'All time' for complete backup)",
      "Choose format: HTML (easy viewing) or JSON (machine-readable)",
      "Select media quality: High quality recommended for photos/videos",
      "Choose notification email"
    ]
  },
  {
    title: "Start Export and Wait",
    description: "Request your data and wait for processing",
    details: [
      "Review your selections carefully",
      "Click 'Start export' to begin",
      "Processing typically takes a few hours to several days",
      "Large accounts may take longer to process",
      "You'll receive email and Facebook notification when ready"
    ]
  },
  {
    title: "Download Your Archive",
    description: "Get your Facebook data",
    details: [
      "Return to Accounts Center > Your information and permissions",
      "Click 'Export your information'",
      "Check 'Available downloads' section",
      "Click 'Download' on your ready export",
      "Enter your password to confirm",
      "Download will be available for 4 days",
      "Save the ZIP file to a secure location with backup"
    ]
  }
];

export default function GuideFacebook() {
  const navigate = useNavigate();
  const [completedSteps, setCompletedSteps] = useState([]);
  const [isRequested, setIsRequested] = useState(false);
  const queryClient = useQueryClient();

  const createArchiveMutation = useMutation({
    mutationFn: (data) => base44.entities.Archive.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archives'] });
      navigate(createPageUrl("Archives"));
    },
  });

  const toggleStep = (index) => {
    if (completedSteps.includes(index)) {
      setCompletedSteps(completedSteps.filter(i => i !== index));
    } else {
      setCompletedSteps([...completedSteps, index]);
    }
  };

  const handleMarkRequested = () => {
    createArchiveMutation.mutate({
      platform: "facebook",
      status: "requested",
      notes: "Data download requested from Facebook via Accounts Center"
    });
    setIsRequested(true);
  };

  const allStepsCompleted = completedSteps.length === steps.length;

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-blue-50 to-white min-h-screen">
      <div className="max-w-4xl mx-auto">
        <Button 
          variant="outline" 
          onClick={() => navigate(createPageUrl("Guides"))}
          className="mb-6 mac-button"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Guides
        </Button>

        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-blue-100 rounded-xl">
              <Facebook className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Facebook Data Download</h1>
              <p className="text-gray-600">Official guide using Facebook Accounts Center</p>
            </div>
          </div>

          {allStepsCompleted && !isRequested && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-green-900 mb-2">All steps completed!</h3>
                    <p className="text-sm text-green-800 mb-4">
                      Have you successfully requested your Facebook data export?
                    </p>
                    <Button 
                      onClick={handleMarkRequested}
                      className="bg-green-600 hover:bg-green-700"
                      disabled={createArchiveMutation.isPending}
                    >
                      Yes, I've Requested My Data
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="mb-6 border-orange-200 bg-orange-50">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-orange-900 mb-2">Important Information</h3>
                <ul className="text-sm text-orange-800 space-y-1">
                  <li>• Processing time: Few hours to several days depending on account size</li>
                  <li>• Download link available for 4 days after creation</li>
                  <li>• Choose HTML format for easy viewing or JSON for data portability</li>
                  <li>• Includes posts, photos, videos, messages, friends list, and more</li>
                  <li>• You must enter your password to download the archive</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {steps.map((step, index) => (
            <Card key={index} className="border-none shadow-md overflow-hidden mac-window">
              <CardHeader className="mac-titlebar">
                <div className="mac-dots">
                  <div className="mac-dot mac-dot-close"></div>
                  <div className="mac-dot mac-dot-minimize"></div>
                  <div className="mac-dot mac-dot-maximize"></div>
                </div>
                <div className="flex items-start gap-4 flex-1 ml-2">
                  <div className="flex items-center gap-3 flex-1">
                    <Checkbox
                      checked={completedSteps.includes(index)}
                      onCheckedChange={() => toggleStep(index)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <Badge variant="outline" className="bg-white">
                          Step {index + 1}
                        </Badge>
                        {completedSteps.includes(index) && (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        )}
                      </div>
                      <CardTitle className="text-xl text-gray-900">{step.title}</CardTitle>
                      <p className="text-sm text-gray-700 mt-1">{step.description}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 bg-white">
                <ul className="space-y-2">
                  {step.details.map((detail, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700">
                      <span className="text-blue-600 font-bold mt-1">•</span>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-8 border-none shadow-lg mac-window">
          <div className="mac-titlebar">
            <div className="mac-dots">
              <div className="mac-dot mac-dot-close"></div>
              <div className="mac-dot mac-dot-minimize"></div>
              <div className="mac-dot mac-dot-maximize"></div>
            </div>
            <span className="ml-2">Next Steps</span>
          </div>
          <CardContent className="space-y-4 bg-white p-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Upload className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h4 className="font-semibold mb-1">After Download</h4>
                <p className="text-sm text-gray-600">
                  Upload your archive to "My Archives" to extract and organize your data with AI assistance.
                </p>
              </div>
            </div>
            <Button 
              onClick={() => navigate(createPageUrl("Archives"))}
              variant="outline"
              className="w-full mac-button"
            >
              Go to My Archives
            </Button>
          </CardContent>
        </Card>

        <div className="mt-6 mac-panel">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            Official Facebook Help
          </h3>
          <p className="text-sm text-gray-600">
            For more information, visit{" "}
            <a 
              href="https://www.facebook.com/help/212802592074644" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Facebook's official export guide
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}