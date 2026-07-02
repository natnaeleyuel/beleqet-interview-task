import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Beleqet database...');

  // ── Job Categories ─────────────────────────────────────────────────────────
  const rawJobCategories = [
    "Accounting And Finance", "Advisory And Consultancy", "Aeronautics And Aerospace",
    "Agriculture", "Architecture And Urban Planning", "Beauty And Grooming",
    "Broker And Case Closer", "Business And Commerce", "Chemical And Biomedical Engineering",
    "Clothing And Textile", "Construction And Civil Engineering", "Creative Art And Design",
    "Customer Service And Care", "Data Mining And Analytics", "Documentation And Writing Services",
    "Entertainment", "Environmental And Energy Engineering", "Event Management And Organization",
    "Fashion Design", "Food And Drink Preparation Or Service", "Gardening And Landscaping",
    "Health Care", "Horticulture", "Hospitality And Tourism", "Human Resource And Talent Management",
    "Information Technology", "Installation And Maintenance Technician", "Janitorial And Other Office Services",
    "Labor Work And Masonry", "Law", "Livestock And Animal Husbandry", "Logistic And Supply Chain",
    "Manufacturing And Production", "Marketing And Advertisement", "Mechanical And Electrical Engineering",
    "Media And Communication", "Multimedia Content Production", "Pharmaceutical",
    "Project Management And Administration", "Psychiatry, Psychology And Social Work",
    "Purchasing And Procurement", "Research And Data Analytics", "Sales And Promotion",
    "Secretarial And Office Management", "Security And Safety", "Shop And Office Attendant",
    "Software Design And Development", "Teaching And Tutor", "Training And Consultancy",
    "Training And Mentorship", "Translation And Transcription", "Transportation",
    "Transportation And Delivery", "Veterinary", "Woodwork And Carpentry"
  ];

  const categories = await Promise.all(
    rawJobCategories.map(cat => {
      const slug = cat.toLowerCase().replace(/[, ]+/g, '-').replace(/-+$/g, '');
      return prisma.jobCategory.upsert({
        where: { slug },
        update: {},
        create: { slug, label: cat, icon: 'briefcase' } // generic icon as default
      });
    })
  );
  console.log('✅ Job categories created');

  // ── Freelance Categories ───────────────────────────────────────────────────
  await Promise.all([
    prisma.freelanceCategory.upsert({ where: { slug: 'graphic-design' },    update: {}, create: { slug: 'graphic-design',    label: 'Graphic Design',      icon: 'palette' } }),
    prisma.freelanceCategory.upsert({ where: { slug: 'web-development' },   update: {}, create: { slug: 'web-development',   label: 'Web Development',     icon: 'code-2' } }),
    prisma.freelanceCategory.upsert({ where: { slug: 'digital-marketing' }, update: {}, create: { slug: 'digital-marketing', label: 'Digital Marketing',   icon: 'megaphone' } }),
    prisma.freelanceCategory.upsert({ where: { slug: 'video-animation' },   update: {}, create: { slug: 'video-animation',   label: 'Video & Animation',   icon: 'clapperboard' } }),
    prisma.freelanceCategory.upsert({ where: { slug: 'writing' },           update: {}, create: { slug: 'writing',           label: 'Writing & Translation', icon: 'pen-line' } }),
  ]);
  console.log('✅ Freelance categories created');

  // ── Demo Companies & Jobs ──────────────────────────────────────────────────
  const itCat = await prisma.jobCategory.findFirst({ where: { slug: 'information-technology' } });
  const marketingCat = await prisma.jobCategory.findFirst({ where: { slug: 'marketing-and-advertisement' } });
  const designCat = await prisma.jobCategory.findFirst({ where: { slug: 'creative-art-and-design' } });

  if (itCat) {
    const employerUser = await prisma.user.upsert({
      where: { email: 'hr@takacash.com' },
      update: {},
      create: {
        email: 'hr@takacash.com',
        passwordHash: await bcrypt.hash('demo123', 10),
        firstName: 'Taka',
        lastName: 'HR',
        role: 'EMPLOYER',
      },
    });

    const comp = await prisma.company.upsert({
      where: { userId: employerUser.id },
      update: {},
      create: {
        name: 'TakaCash',
        description: 'Leading fintech company in Ethiopia',
        userId: employerUser.id,
        verified: true,
      },
    });

    await prisma.job.upsert({
      where: { id: 'demo-job-1' },
      update: {},
      create: {
        id: 'demo-job-1',
        title: 'Full Stack Developer',
        description: 'Build customer-facing fintech products using React, Node.js, and PostgreSQL.',
        location: 'Addis Ababa',
        type: 'FULL_TIME' as any,
        status: 'PUBLISHED' as any,
        featured: true,
        categoryId: itCat.id,
        companyId: comp.id,
      },
    });
  }

  if (marketingCat) {
    const ethioUser = await prisma.user.upsert({
      where: { email: 'hr@ethiotelecom.com' },
      update: {},
      create: {
        email: 'hr@ethiotelecom.com',
        passwordHash: await bcrypt.hash('demo123', 10),
        firstName: 'Ethio',
        lastName: 'HR',
        role: 'EMPLOYER',
      },
    });

    const ethioComp = await prisma.company.upsert({
      where: { userId: ethioUser.id },
      update: {},
      create: {
        name: 'ethio telecom',
        description: "Ethiopia's largest telecom provider",
        userId: ethioUser.id,
        verified: true,
      },
    });

    await prisma.job.upsert({
      where: { id: 'demo-job-2' },
      update: {},
      create: {
        id: 'demo-job-2',
        title: 'Digital Marketing Specialist',
        description: 'Plan and execute digital campaigns across search, social, and Telegram channels.',
        location: 'Addis Ababa',
        type: 'HYBRID' as any,
        status: 'PUBLISHED' as any,
        featured: true,
        categoryId: marketingCat.id,
        companyId: ethioComp.id,
      },
    });
  }

  if (designCat) {
    const zemenUser = await prisma.user.upsert({
      where: { email: 'hr@zemenbank.com' },
      update: {},
      create: {
        email: 'hr@zemenbank.com',
        passwordHash: await bcrypt.hash('demo123', 10),
        firstName: 'Zemen',
        lastName: 'HR',
        role: 'EMPLOYER',
      },
    });

    const zemenComp = await prisma.company.upsert({
      where: { userId: zemenUser.id },
      update: {},
      create: {
        name: 'Zemen Bank',
        description: 'Leading private bank in Ethiopia',
        userId: zemenUser.id,
        verified: true,
      },
    });

    await prisma.job.upsert({
      where: { id: 'demo-job-3' },
      update: {},
      create: {
        id: 'demo-job-3',
        title: 'UI/UX Designer',
        description: 'Design intuitive digital banking experiences across web and mobile.',
        location: 'Addis Ababa',
        type: 'FULL_TIME' as any,
        status: 'PUBLISHED' as any,
        featured: true,
        categoryId: designCat.id,
        companyId: zemenComp.id,
      },
    });
  }

  console.log('✅ Demo companies and jobs created');

  console.log('\n🎉 Database seeded successfully with Production Categories!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
