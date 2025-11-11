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
  Music2,
  Upload
} from "lucide-react";

const steps = [
  {
    title: "Open TikTok Settings",
    description: "Access your account settings in the app",
    details: [
      "Open the TikTok app on your mobile device",
      "Tap 'Profile' icon at the bottom right",
      "Tap the three horizontal lines (☰) menu at the top right",
      "Select 'Settings and privacy'"
    ]
  },
  {
    title: "Navigate to Account Settings",
    description: "Find the data download option",
    details: [
      "In Settings, tap 'Account'",
      "Scroll down to find 'Download your data'",
      "Tap 'Download your data' to proceed",
      "You'll see options for data format"
    ]
  },
  {
    title: "Select Download Format",
    description: "Choose how to receive your data",
    details: [
      "Option 1: 'Download your data' - TXT format (human-readable)",
      "Option 2: 'Request data file' - JSON format (more comprehensive)",
      "JSON format recommended for complete backup with all details",
      "Select specific data categories or choose 'Select all'",
      "Data includes videos, likes, comments, messages, and more"
    ]
  },
  {
    title: "Request Your Archive",
    description: "Submit and verify your request",
    details: [
      "Review your data selection carefully",
      "You may need to verify your phone number or email",
      "Enter any verification code sent to you",
      "Tap 'Request data' or 'Download' to submit",
      "You'll receive confirmation of your request"
    ]
  },
  {
    title: "Wait for Processing",
    description: "TikTok prepares your data archive",
    details: [
      "Processing time: Up to 4 days typically",
      "You'll receive an in-app notification when ready",
      "Check your email for download notification",
      "File will be available in the 'Download your data' section",
      "Large accounts may take the full 4 days"
    ]
  },
  {
    title: "Download Your Archive",
    description: "Get your TikTok data",
    details: [
      "Return to Settings > Account > Download your data",
      "Tap 'Download data' when the file is available",
      "The file(s) will download to your device",
      "JSON format may result in multiple files",
      "Save all files securely with backup copies",
      "Videos are included in the archive at original quality"
    ]
  }
];

export default function GuideTikTok() {
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
      platform: "tiktok",
      status: "requested",
      notes: "Data download requested from TikTok"
    });
    setIsRequested(true);
  };

  const allStepsCompleted = completedSteps.length === steps.length;

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-white min-h-screen">
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
            <div className="p-4 bg-gray-100 rounded-xl">
              <Music2 className="w-8 h-8 text-gray-900" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">TikTok Data Download</h1>
              <p className="text-gray-600">Official guide to downloading your TikTok archive</p>
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
                      Have you successfully requested your TikTok data download?
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
                  <li>• Processing time: Up to 4 days</li>
                  <li>• TXT format for quick viewing, JSON for complete data</li>
                  <li>• Videos are included at original quality</li>
                  <li>• Large accounts may receive multiple archive files</li>
                  <li>• Download available for limited time after creation</li>
                  <li>• Must use TikTok mobile app to request download</li>
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
                      <span className="text-gray-900 font-bold mt-1">•</span>
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
            Official TikTok Help
          </h3>
          <p className="text-sm text-gray-600">
            For more information, visit{" "}
            <a 
              href="https://support.tiktok.com/en/account-and-privacy/personalized-ads-and-data/requesting-your-data" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-900 hover:underline"
            >
              TikTok's official data request guide
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}