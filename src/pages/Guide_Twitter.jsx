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
  Twitter,
  Upload
} from "lucide-react";

const steps = [
  {
    title: "Open X/Twitter Settings",
    description: "Navigate to your account settings",
    details: [
      "Log into X (formerly Twitter) at x.com in a web browser",
      "Click 'More' (three horizontal dots) in the left sidebar",
      "Select 'Settings and privacy' from the menu",
      "Click 'Your account' in the settings menu"
    ]
  },
  {
    title: "Request Your Archive",
    description: "Initiate the download process",
    details: [
      "In 'Your account', click 'Download an archive of your data'",
      "You'll need to verify your identity first",
      "Enter your X password when prompted",
      "Enter the verification code sent to your email"
    ]
  },
  {
    title: "Complete Archive Request",
    description: "Confirm your data request",
    details: [
      "After verification, click 'Request archive' button",
      "Your request will be submitted to X",
      "You'll see confirmation that request was received",
      "Processing typically takes 24 hours"
    ]
  },
  {
    title: "Wait for Processing",
    description: "X prepares your complete archive",
    details: [
      "Processing usually takes 24 hours",
      "Large accounts may take up to 48 hours",
      "You'll receive an in-app notification when ready",
      "You'll also get an email notification",
      "The archive includes all tweets, DMs, media, and account data"
    ]
  },
  {
    title: "Download Your Archive",
    description: "Get your complete X/Twitter data",
    details: [
      "Return to 'More' > 'Settings and privacy' > 'Your account'",
      "Click 'Download an archive of your data'",
      "Click 'Download archive' button when available",
      "Re-enter your password to confirm download",
      "Save the ZIP file to your computer",
      "Store in a secure location with backup"
    ]
  },
  {
    title: "Extract and Review",
    description: "Access your Twitter archive",
    details: [
      "Unzip the downloaded ZIP file",
      "Open 'Your archive.html' in a web browser",
      "Browse your tweets, DMs, followers, and media",
      "Archive includes both HTML (for viewing) and data folders",
      "JSON files contain raw data for programmatic access"
    ]
  }
];

export default function GuideTwitter() {
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
      platform: "twitter",
      status: "requested",
      notes: "Data archive requested from X/Twitter"
    });
    setIsRequested(true);
  };

  const allStepsCompleted = completedSteps.length === steps.length;

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-sky-50 to-white min-h-screen">
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
            <div className="p-4 bg-sky-100 rounded-xl">
              <Twitter className="w-8 h-8 text-sky-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">X/Twitter Data Download</h1>
              <p className="text-gray-600">Official guide to downloading your X archive</p>
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
                      Have you successfully requested your X/Twitter data download?
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
                  <li>• Processing time: Usually 24 hours (up to 48 hours for large accounts)</li>
                  <li>• You can only request one archive at a time</li>
                  <li>• Must wait 24 hours before requesting another archive</li>
                  <li>• Includes all tweets, DMs, media, followers, and account info</li>
                  <li>• Archive contains HTML file for easy viewing and JSON for data access</li>
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
                      <span className="text-sky-600 font-bold mt-1">•</span>
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
            Official X Help
          </h3>
          <p className="text-sm text-gray-600">
            For more information, visit{" "}
            <a 
              href="https://help.twitter.com/en/managing-your-account/how-to-download-your-twitter-archive" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sky-600 hover:underline"
            >
              X's official archive guide
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}