import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  AlertTriangle, 
  CheckCircle2, 
  Shield, 
  Download,
  Eye,
  Trash2
} from "lucide-react";

const checklistItems = [
  {
    category: "Data Download",
    icon: Download,
    color: "blue",
    items: [
      "Downloaded complete Facebook archive",
      "Downloaded Instagram data",
      "Downloaded Twitter archive",
      "Downloaded LinkedIn data",
      "Downloaded TikTok data",
      "Verified all downloads are complete and not corrupted"
    ]
  },
  {
    category: "Data Verification",
    icon: Eye,
    color: "purple",
    items: [
      "Opened and reviewed downloaded archives",
      "Verified all photos are included",
      "Checked that messages are complete",
      "Confirmed friends/connections list is saved",
      "Verified posts and comments are included",
      "Saved any additional content not in archive"
    ]
  },
  {
    category: "Backup & Storage",
    icon: Shield,
    color: "green",
    items: [
      "Copied archives to external hard drive",
      "Created cloud backup (Google Drive, Dropbox, etc.)",
      "Verified backup files are accessible",
      "Created a second backup copy",
      "Documented where archives are stored",
      "Set calendar reminder to verify backups in 6 months"
    ]
  },
  {
    category: "Pre-Deletion Steps",
    icon: AlertTriangle,
    color: "orange",
    items: [
      "Saved important contacts' information separately",
      "Downloaded any important photos not in archive",
      "Noted any groups or pages you manage",
      "Informed friends/connections about leaving",
      "Unlinked account from other apps and services",
      "Updated email/login info on other sites"
    ]
  },
  {
    category: "Account Deletion",
    icon: Trash2,
    color: "red",
    items: [
      "Read platform's account deletion policy",
      "Understand account recovery period",
      "Deactivated account first (if available)",
      "Waited through deactivation period",
      "Confirmed permanent deletion request",
      "Documented deletion confirmation"
    ]
  }
];

export default function Checklist() {
  const [checkedItems, setCheckedItems] = useState({});

  const toggleItem = (category, index) => {
    const key = `${category}-${index}`;
    setCheckedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getCategoryProgress = (category) => {
    const items = checklistItems.find(c => c.category === category)?.items || [];
    const checked = items.filter((_, index) => checkedItems[`${category}-${index}`]).length;
    return items.length > 0 ? (checked / items.length) * 100 : 0;
  };

  const totalItems = checklistItems.reduce((sum, cat) => sum + cat.items.length, 0);
  const totalChecked = Object.values(checkedItems).filter(Boolean).length;
  const overallProgress = (totalChecked / totalItems) * 100;

  const colorClasses = {
    blue: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
    purple: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
    green: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
    orange: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
    red: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Safe Deletion Checklist
          </h1>
          <p className="text-gray-600 mb-6">
            Complete this checklist before deleting your social media accounts to ensure nothing is lost
          </p>

          <Card className="border-none shadow-lg mb-6">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                <Badge variant="outline" className="bg-blue-50">
                  {totalChecked} / {totalItems} completed
                </Badge>
              </div>
              <Progress value={overallProgress} className="h-3" />
              {overallProgress === 100 && (
                <div className="mt-4 flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold">All items completed! You're ready to proceed.</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Alert className="border-red-200 bg-red-50 mb-6">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>Important:</strong> Account deletion is usually permanent after a grace period (typically 30 days). 
              Make sure you've backed up everything before proceeding.
            </AlertDescription>
          </Alert>
        </div>

        <div className="space-y-6">
          {checklistItems.map((category) => {
            const CategoryIcon = category.icon;
            const colors = colorClasses[category.color];
            const progress = getCategoryProgress(category.category);
            
            return (
              <Card key={category.category} className="border-none shadow-lg overflow-hidden">
                <CardHeader className={`${colors.bg} border-b ${colors.border}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 bg-white rounded-lg`}>
                        <CategoryIcon className={`w-5 h-5 ${colors.text}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{category.category}</CardTitle>
                        <CardDescription className="mt-1">
                          {category.items.filter((_, index) => checkedItems[`${category.category}-${index}`]).length} of {category.items.length} completed
                        </CardDescription>
                      </div>
                    </div>
                    <Badge className={colors.bg + " " + colors.text}>
                      {progress.toFixed(0)}%
                    </Badge>
                  </div>
                  <Progress value={progress} className="h-2 mt-3" />
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    {category.items.map((item, index) => (
                      <div 
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => toggleItem(category.category, index)}
                      >
                        <Checkbox
                          checked={checkedItems[`${category.category}-${index}`] || false}
                          onCheckedChange={() => toggleItem(category.category, index)}
                          className="mt-1"
                        />
                        <label 
                          className={`flex-1 cursor-pointer ${
                            checkedItems[`${category.category}-${index}`] 
                              ? 'line-through text-gray-500' 
                              : 'text-gray-700'
                          }`}
                        >
                          {item}
                        </label>
                        {checkedItems[`${category.category}-${index}`] && (
                          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="mt-8 border-none shadow-lg">
          <CardHeader>
            <CardTitle>Final Reminders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3 items-start">
              <div className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-xs font-bold text-yellow-700">!</span>
              </div>
              <p className="text-sm text-gray-700">
                Most platforms have a grace period (usually 30 days) where you can still recover your account
              </p>
            </div>
            <div className="flex gap-3 items-start">
              <div className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-xs font-bold text-yellow-700">!</span>
              </div>
              <p className="text-sm text-gray-700">
                Keep your backup files safe and accessible - you may need them for legal or personal reasons
              </p>
            </div>
            <div className="flex gap-3 items-start">
              <div className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-xs font-bold text-yellow-700">!</span>
              </div>
              <p className="text-sm text-gray-700">
                Some connected apps may lose functionality when you delete your social media accounts
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}