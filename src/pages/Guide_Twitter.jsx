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
    title: "Access Twitter Settings",
    description: "Navigate to your account settings",
    details: [
      "Log into Twitter/X on web (twitter.com or x.com)",
      "Click 'More' in the left sidebar (three dots icon)",
      "Select 'Settings and privacy'",
      "Click on 'Your account'"
    ]
  },
  {
    title: "Request Your Archive",
    description: "Find the data download option",
    details: [
      "In 'Your account', scroll down to 'Download an archive of your data'",
      "Click on it to start the process",
      "You may need to verify your identity (email or phone code)",
      "Click 'Request archive' button"
    ]
  },
  {
    title: "Verify Your Request",
    description: "Confirm your identity",
    details: [
      "Twitter will send a verification code to your email or phone",
      "Enter the verification code when prompted",
      "Confirm your password if requested",
      "Your request will be submitted"
    ]
  },
  {
    title: "Wait for Processing",
    description: "Twitter prepares your data",
    details: [
      "Processing usually takes 24 hours",
      "Large accounts may take up to 48 hours",
      "You'll receive an email when your archive is ready",
      "The download link will be available in your settings"
    ]
  },
  {
    title: "Download Your Archive",
    description: "Get your complete Twitter data",
    details: [
      "Return to 'Settings and privacy' > 'Your account' > 'Download an archive of your data'",
      "Click 'Download archive' button",
      "Re-enter your password to confirm",
      "Download will start automatically (ZIP file)",
      "Save to a secure location"
    ]
  },
  {
    title: "Extract and Review",
    description: "Access your Twitter data",
    details: [
      "Extract the ZIP file to a folder",
      "Open 'Your archive.html' in a web browser to view",
      "Includes: tweets, DMs, followers, media, account data",
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
      notes: "Data download requested from Twitter/X"
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
          className="mb-6"
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
              <h1 className="text-3xl font-bold text-gray-900">Twitter/X Data Download</h1>
              <p className="text-gray-600">Complete guide to downloading your Twitter archive</p>
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
                      Have you successfully requested your Twitter data download?
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
                  <li>• Processing time: Usually 24 hours</li>
                  <li>• You can only request one archive at a time</li>
                  <li>• Must wait 24 hours before requesting another archive</li>
                  <li>• Includes all tweets, DMs, media, and account info</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {steps.map((step, index) => (
            <Card key={index} className="border-none shadow-md overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-sky-50 to-white">
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
                      <span className="text-sky-600 font-bold mt-1">•</span>
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
            Official Twitter Help
          </h3>
          <p className="text-sm text-gray-600">
            For more information, visit{" "}
            <a 
              href="https://help.twitter.com/en/managing-your-account/how-to-download-your-twitter-archive" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sky-600 hover:underline"
            >
              Twitter's official guide
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}