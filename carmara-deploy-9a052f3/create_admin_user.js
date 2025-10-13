import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('缺少必要的环境变量');
    console.log('VITE_SUPABASE_URL:', supabaseUrl ? '已设置' : '未设置');
    console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '已设置' : '未设置');
    process.exit(1);
}

// 使用服务角色密钥创建管理客户端
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function createAdminUser() {
    try {
        console.log('正在删除现有管理员用户...');
        
        // 先尝试删除现有用户
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingAdmin = existingUsers.users.find(u => u.email === 'admin@casmara.com');
        
        if (existingAdmin) {
            console.log('找到现有管理员用户，正在删除...');
            await supabase.auth.admin.deleteUser(existingAdmin.id);
            console.log('现有用户已删除');
        }
        
        console.log('正在创建管理员用户...');
        
        // 使用管理API创建用户
        const { data: user, error: createError } = await supabase.auth.admin.createUser({
            email: 'admin@casmara.com',
            password: 'admin123',
            email_confirm: true,
            user_metadata: {
                full_name: 'Administrador del Sistema'
            }
        });
        
        if (createError) {
            console.error('创建用户失败:', createError);
            return;
        }
        
        console.log('用户创建成功:', user.user.id);
        
        // 创建对应的profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: user.user.id,
                name: 'Administrador',
                email: 'admin@casmara.com',
                full_name: 'Administrador del Sistema',
                role: 'administrador'
            });
            
        if (profileError) {
            console.error('创建profile失败:', profileError);
            return;
        }
        
        console.log('Profile创建成功');
        
        // 测试登录
        console.log('\n测试登录...');
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: 'admin@casmara.com',
            password: 'admin123'
        });
        
        if (loginError) {
            console.error('登录测试失败:', loginError);
        } else {
            console.log('登录测试成功!', loginData.user.email);
        }
        
    } catch (error) {
        console.error('发生错误:', error);
    }
}

createAdminUser();