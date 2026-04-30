import { NextResponse } from 'next/server';
import { allCourses } from '@/data/courses/transportation';

export async function GET() {
  return NextResponse.json(allCourses);
}
