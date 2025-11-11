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
    title: "Access Facebook Settings",
    description: "Log into your Facebook account and navigate to Settings & Privacy",
    details: [
      "Click on your profile picture in the top right corner",
      "Select 'Settings & Privacy' from the dropdown menu",
      "Click on 'Settings'"
    ],
    image: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&h=400&fit=crop"
  },
  {
    title: "Find 'Your Facebook Information'",
    description: "Locate the data download section",
    details: [
      "In the left sidebar, look for 'Your Facebook Information'",
      "Click on 'Download Your Information'",
      "You'll see options to customize what data to download"
    ]
  },
  {
    title: "Select What to Download",
    description: "Choose which data you want to include",
    details: [
      "Select 'All of your Facebook information' or pick specific categories",
      "Recommended: Posts, Photos and videos, Comments, Messages, Profile information, Friends and followers",
      "Choose date range (or select 'All time' for complete archive)"
    ]
  },
  {
    title: "Choose Format and Quality",
    description: "Configure download settings",
    details: [
      "Format: Select 'JSON' for best compatibility (or HTML for easier viewing)",
      "Media Quality: Choose 'High' for best quality",
      "Click 'Create File' button"
    ]
  },
  {
    title: "Wait for Processing",
    description: "Facebook will prepare your archive",
    details: [
      "You'll see a message: 'We're preparing your download'",
      "This usually takes 24-48 hours for most accounts",
      "You'll receive an email when it's ready",
      "Check 'Available Copies' section to see progress"
    ]
  },
  {
    title: "Download Your Archive",
    description: "Get your data when it's ready",
    details: [
      "Check your email for the notification",
      "Return to 'Download Your Information' page",
      "Click the 'Download' button next to your available file",
      "Enter your password to confirm",
      "Save the ZIP file to a secure location"
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
      notes: "Data download requested from Facebook"
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
          className="mb-6"
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
              <p className="text-gray-600">Complete guide to downloading your Facebook archive</p>
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
                      Have you successfully requested your Facebook data download?
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
                  <li>• Processing time: Usually 24-48 hours (may take longer for large accounts)</li>
                  <li>• Download link expires after 4 days</li>
                  <li>• File size can range from 100MB to several GB</li>
                  <li>• You'll need to enter your password to download</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {steps.map((step, index) => (
            <Card key={index} className="border-none shadow-md overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-white">
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
                {step.image && (
                  <img 
                    src={step.image} 
                    alt={step.title}
                    className="w-full rounded-lg mb-4 shadow-sm"
                  />
                )}
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
                  Once you've downloaded your archive, upload it to the "My Archives" section to organize and review your data.
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
              Facebook's official guide
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}