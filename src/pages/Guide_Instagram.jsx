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
  Instagram,
  Upload
} from "lucide-react";

const steps = [
  {
    title: "Open Instagram Settings",
    description: "Access your account settings on mobile or web",
    details: [
      "Open Instagram app or visit instagram.com on web",
      "Go to your profile (tap your profile picture)",
      "Tap the menu icon (three lines) in the top right",
      "Select 'Settings and privacy'",
      "Tap 'Accounts Center' at the top"
    ]
  },
  {
    title: "Navigate to Your Information",
    description: "Find the data download section",
    details: [
      "In Accounts Center, tap 'Your information and permissions'",
      "Select 'Download your information'",
      "Choose 'Request a download' or 'Download or transfer information'"
    ]
  },
  {
    title: "Select Instagram Account",
    description: "Choose which account data to download",
    details: [
      "If you have multiple accounts, select the Instagram account",
      "Choose 'Some of your information' for specific data or 'All available information'",
      "Select specific categories: Posts, Stories, Reels, Messages, Comments, Profile info"
    ]
  },
  {
    title: "Set Download Format",
    description: "Configure how you want to receive your data",
    details: [
      "Format: Choose 'JSON' for programmatic access or 'HTML' for easy viewing",
      "Media quality: Select 'High' to get full-resolution photos and videos",
      "Date range: Select 'All time' for complete history",
      "Tap 'Create files'"
    ]
  },
  {
    title: "Wait for Processing",
    description: "Instagram prepares your archive",
    details: [
      "Processing usually takes 48 hours (can be up to 14 days for large accounts)",
      "You'll receive an email when ready",
      "Check 'Available copies' in the same menu to see progress",
      "Files remain available for 4 days after creation"
    ]
  },
  {
    title: "Download Your Data",
    description: "Get your archive when ready",
    details: [
      "Open the email notification from Instagram",
      "Click the download link or return to 'Download your information'",
      "Enter your password to verify identity",
      "Download the ZIP file(s) to your device",
      "Save to a secure location with backup"
    ]
  }
];

export default function GuideInstagram() {
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
      platform: "instagram",
      status: "requested",
      notes: "Data download requested from Instagram"
    });
    setIsRequested(true);
  };

  const allStepsCompleted = completedSteps.length === steps.length;

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-pink-50 to-white min-h-screen">
      <div className="max-w-4xl mx-auto">
        <Button 
          variant="outline" 
          onClick={() => navigate(createPageUrl("Guides"))}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Guides
        </Button>

        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-gradient-to-br from-pink-100 to-purple-100 rounded-xl">
              <Instagram className="w-8 h-8 text-pink-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Instagram Data Download</h1>
              <p className="text-gray-600">Complete guide to downloading your Instagram archive</p>
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
                      Have you successfully requested your Instagram data download?
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
                  <li>• Processing time: 48 hours to 14 days depending on account size</li>
                  <li>• Download link expires after 4 days</li>
                  <li>• Large accounts may be split into multiple ZIP files</li>
                  <li>• Includes photos, videos, messages, stories, and more</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {steps.map((step, index) => (
            <Card key={index} className="border-none shadow-md overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-pink-50 to-white">
                <div className="flex items-start gap-4">
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
                      <CardTitle className="text-xl">{step.title}</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-2">
                  {step.details.map((detail, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700">
                      <span className="text-pink-600 font-bold mt-1">•</span>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-8 border-none shadow-lg">
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
              className="w-full"
            >
              Go to My Archives
            </Button>
          </CardContent>
        </Card>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            Official Instagram Help
          </h3>
          <p className="text-sm text-gray-600">
            For more information, visit{" "}
            <a 
              href="https://help.instagram.com/181231772500920" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-pink-600 hover:underline"
            >
              Instagram's official guide
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}