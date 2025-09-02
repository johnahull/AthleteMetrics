import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUp } from "lucide-react";
import MeasurementForm from "@/components/measurement-form";

export default function DataEntry() {
  const { data: recentMeasurements } = useQuery({
    queryKey: ["/api/measurements"],
  });

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Data Entry</h1>
          <Button variant="outline" className="bg-gray-600 text-white hover:bg-gray-700">
            <FileUp className="h-4 w-4 mr-2" />
            Bulk Import
          </Button>
        </div>

        {/* Measurement Form */}
        <Card className="bg-white mb-6">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Add New Measurement</h3>
            <MeasurementForm />
          </CardContent>
        </Card>

        {/* Recent Entries */}
        <Card className="bg-white">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Recent Entries</h3>
            <div className="space-y-4">
              {recentMeasurements?.slice(0, 10).map((measurement) => (
                <div key={measurement.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {measurement.user.firstName.charAt(0)}{measurement.user.lastName.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{measurement.user.fullName}</p>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span>
                          {measurement.metric === "FLY10_TIME" ? "Fly-10" : "Vertical"}: {measurement.value}{measurement.units}
                        </span>
                        <span>•</span>
                        <span>{measurement.date}</span>
                        {measurement.notes && (
                          <>
                            <span>•</span>
                            <span>{measurement.notes}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="ghost" size="sm">
                      <i className="fas fa-edit"></i>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                      <i className="fas fa-trash"></i>
                    </Button>
                  </div>
                </div>
              ))}
              
              {(!recentMeasurements || recentMeasurements.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <p>No recent measurements found.</p>
                  <p className="text-sm">Start by adding a new measurement above.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
