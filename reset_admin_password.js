import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TARGET_EMAIL = process.env.TARGET_EMAIL || 'admin@casmara.com';
const NEW_PASSWORD = process.env.NEW_PASSWORD || 'admin123';

if (!supabaseUrl || !serviceRoleKey) {
    console.error('缺少必要的环境变量');
    console.error('VITE_SUPABASE_URL:', !!supabaseUrl);
    console.error('SUPABASE_SERVICE_ROLE_KEY:', !!serviceRoleKey);
    process.exit(1);
}

// 使用服务角色密钥创建管理客户端
const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function resetAdminPassword() {
    try {
        console.log(`正在重置用户(${TARGET_EMAIL})的密码...`);
        
        // 使用管理API更新用户密码
        const userId = await getUserId();
        const { data, error } = await supabase.auth.admin.updateUserById(
            userId,
            {
                password: NEW_PASSWORD
            }
        );
        
        if (error) {
            console.error('重置密码失败:', error.message);
            console.error('错误详情:', error);
            return;
        }
        
        console.log('密码重置成功!');
        console.log('用户信息:', data.user);
        
        // 测试登录
        await testLogin();
        
    } catch (error) {
        console.error('重置密码时发生错误:', error.message);
        console.error('错误详情:', error);
    }
}

async function getUserId() {
    try {
        // 首先尝试从profiles表查询
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', TARGET_EMAIL)
            .single();
        
        if (profileData && !profileError) {
            console.log('从profiles表找到用户ID:', profileData.id);
            return profileData.id;
        }
        
        console.log('profiles表中未找到用户，尝试直接查询auth.users...');
        
        // 如果profiles表中没有，直接查询auth.users表
        const { data: userData, error: userError } = await supabase
            .rpc('get_user_by_email', { user_email: TARGET_EMAIL });
        
        if (userError) {
            console.log('RPC调用失败，尝试列出所有用户...');
            
            // 列出所有用户来查找目标用户
            const { data: allUsers, error: listError } = await supabase.auth.admin.listUsers();
            
            if (listError) {
                throw new Error(`无法列出用户: ${listError.message}`);
            }
            
            const targetUser = allUsers.users.find(user => user.email === TARGET_EMAIL);
            
            if (!targetUser) {
                throw new Error(`找不到用户: ${TARGET_EMAIL}`);
            }
            
            console.log('从用户列表找到用户ID:', targetUser.id);
            return targetUser.id;
        }
        
        if (userData && userData.length > 0) {
            console.log('从RPC找到用户ID:', userData[0].id);
            return userData[0].id;
        }
        
        throw new Error(`找不到用户: ${TARGET_EMAIL}`);
        
    } catch (error) {
        console.error('查询用户ID时发生错误:', error.message);
        throw error;
    }
}

async function testLogin() {
    try {
        console.log('\n测试登录...');
        
        // 创建新的客户端用于测试登录
        const testClient = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY);
        
        const { data, error } = await testClient.auth.signInWithPassword({
            email: TARGET_EMAIL,
            password: NEW_PASSWORD
        });
        
        if (error) {
            console.error('登录测试失败:', error.message);
            console.error('错误详情:', error);
            return;
        }
        
        console.log('登录测试成功!');
        console.log('用户:', data.user.email);
        console.log('会话:', !!data.session);
        
    } catch (error) {
        console.error('登录测试时发生错误:', error.message);
    }
}

resetAdminPassword();