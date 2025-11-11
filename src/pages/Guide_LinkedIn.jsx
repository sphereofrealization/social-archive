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
  Linkedin,
  Upload
} from "lucide-react";

const steps = [
  {
    title: "Access LinkedIn Settings",
    description: "Navigate to Settings & Privacy",
    details: [
      "Log into LinkedIn at linkedin.com",
      "Click the 'Me' icon at the top of your homepage",
      "Select 'Settings & Privacy' from the dropdown menu",
      "Click 'Data Privacy' in the left sidebar"
    ]
  },
  {
    title: "Find Data Download Section",
    description: "Locate the data export option",
    details: [
      "Under 'How LinkedIn uses your data' section",
      "Click 'Get a copy of your data'",
      "You'll see options for what data to download",
      "Note: This feature is only available on desktop, not mobile"
    ]
  },
  {
    title: "Select Data to Download",
    description: "Choose which information you want",
    details: [
      "Option 1: Select 'Download larger data archive' for comprehensive backup",
      "Option 2: Choose 'Want something specific?' to select individual categories",
      "Categories include: Profile, Connections, Messages, Activity, and more",
      "For complete backup, select all applicable categories",
      "Click 'Request archive' when ready"
    ]
  },
  {
    title: "Verify Your Request",
    description: "Confirm your identity if needed",
    details: [
      "Review your selections carefully",
      "You may need to verify your email address",
      "LinkedIn will confirm your request was received",
      "You can only have one active request at a time"
    ]
  },
  {
    title: "Wait for Processing",
    description: "LinkedIn prepares your data export",
    details: [
      "Small data requests: Available within 10 minutes",
      "Larger archive: Typically ready within 24 hours",
      "Very large profiles may take up to 72 hours",
      "You'll receive an email notification when ready",
      "Download link is valid for 72 hours after creation"
    ]
  },
  {
    title: "Download Your Archive",
    description: "Get your LinkedIn data",
    details: [
      "Check your email for the download notification",
      "Click the download link in the email OR",
      "Return to Settings & Privacy > Data Privacy > Get a copy of your data",
      "Click 'Download' on your available archive",
      "Archive will be in ZIP format with CSV files",
      "Save to a secure location with backup",
      "Download only on a personal computer, not public device"
    ]
  }
];

export default function GuideLinkedIn() {
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
      platform: "linkedin",
      status: "requested",
      notes: "Data download requested from LinkedIn"
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
              <Linkedin className="w-8 h-8 text-blue-700" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">LinkedIn Data Download</h1>
              <p className="text-gray-600">Official guide to downloading your LinkedIn archive</p>
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
                      Have you successfully requested your LinkedIn data download?
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
                  <li>• Small requests: Available within 10 minutes</li>
                  <li>• Large archive: Ready within 24-72 hours</li>
                  <li>• Download link expires after 72 hours</li>
                  <li>• Data provided in CSV format for easy viewing</li>
                  <li>• Only available on desktop, not mobile devices</li>
                  <li>• Includes connections, messages, posts, profile info, and more</li>
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
            Official LinkedIn Help
          </h3>
          <p className="text-sm text-gray-600">
            For more information, visit{" "}
            <a 
              href="https://www.linkedin.com/help/linkedin/answer/a1339364" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-700 hover:underline"
            >
              LinkedIn's official data download guide
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}